import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { startHarness } from "./lib/ui-harness.mjs";
import { mkdirSync } from "node:fs";
const { scenario, expect, T, finish } = await startHarness();
mkdirSync("test-results/runner", { recursive: true });
await scenario("W1", "Workspace usa dados, preserva tarefas e navega pelos agentes", async ({ page, open }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await open("/workspace");
  await page.getByRole("heading", { name: "Agent Workspace" }).waitFor(T);
  await page.getByLabel("Contexto do projeto").fill("Meu projeto local");
  await page.getByLabel("Próxima tarefa").fill("Revisar arquitetura");
  await page.getByRole("button", { name: "Adicionar tarefa local" }).click();
  await page.getByLabel("Revisar arquitetura", { exact: true }).check();
  await page.reload();
  await page.getByRole("heading", { name: "Agent Workspace" }).waitFor(T);
  expect(await page.getByLabel("Revisar arquitetura", { exact: true }).isChecked(), "tarefa não persistiu");
  expect((await page.getByLabel("Contexto do projeto").inputValue()) === "Meu projeto local", "contexto não persistiu");
  await page.screenshot({ path: "test-results/runner/workspace-desktop.png", fullPage: true });
  await page.getByLabel("Contexto do Dot").selectOption("correio");
  await page.getByRole("button", { name: "Abrir Correio", exact: true }).waitFor(T);
});
await scenario("W2", "Workspace móvel e claro: sem overflow, permissões verdadeiras", async ({ page, open }) => {
  await page.addInitScript(() => localStorage.setItem("open-dot:prefs", JSON.stringify({ theme: "light" })));
  await open("/workspace");
  await page.getByRole("heading", { name: "Agent Workspace" }).waitFor(T);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `overflow ${width}`);
  }
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact));
  expect(!violations.length, `axe Workspace: ${violations.map((v) => v.id).join(", ")}`);
  await page.screenshot({ path: "test-results/runner/workspace-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Gerenciar Runner" }).click();
  await page.getByRole("button", { name: "Parear no Workspace" }).waitFor(T);
  await page.getByRole("button", { name: "Parear no Workspace" }).click();
  await page.getByRole("heading", { name: "Agent Workspace" }).waitFor(T);
  expect(await page.getByRole("button", { name: "Enviar ao Runner" }).isDisabled(), "execução sem driver habilitada");
  await page.screenshot({ path: "test-results/runner/runner-panel.png", fullPage: true });
});
await scenario("W3", "Resumo preserva evidência e mostra fato, motivo e próximo passo", async ({ page, open }) => {
  await open("/meu-dia");
  await page.getByText("O que aconteceu", { exact: true }).first().waitFor(T);
  await page.getByText("Por que importa", { exact: true }).first().waitFor(T);
  await page.getByText("O que fazer agora", { exact: true }).first().waitFor(T);
  await page
    .getByRole("link", { name: /Abrir a fonte:/ })
    .first()
    .waitFor(T);
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact));
  expect(!violations.length, `axe Correio: ${violations.map((v) => v.id).join(", ")}`);
  await page.screenshot({ path: "test-results/runner/mail-summary.png", fullPage: true });
});
await scenario("W4", "Paleta aprovada fica na UI; Dot preserva gradiente em todos os estados", async ({ page, open }) => {
  await open("/workspace");
  for (const [id, color, name] of [
    ["codex", "rgb(136, 120, 238)", "Codex"],
    ["claude-code", "rgb(233, 154, 105)", "Claude Code"],
    ["cursor", "rgb(105, 169, 222)", "Cursor"],
  ]) {
    const card = page.locator(`.mechanism-card[data-mechanism="${id}"]`);
    await card.getByText(name, { exact: true }).waitFor(T);
    expect((await card.locator(".mechanism-indicator").evaluate((el) => getComputedStyle(el).backgroundColor)) === color, `cor errada: ${name}`);
  }
  expect((await page.locator('.mechanism-card[data-mechanism="whatsapp"]').count()) === 0, "WhatsApp apareceu ativo");
  await open("/mascote");
  for (const name of ["Em repouso", "Pensando", "Trabalhando", "Esperando seu OK", "Perguntando", "Concluído", "Com erro", "Sem conexão", "Dormindo"]) {
    await page.getByRole("radio", { name, exact: true }).check();
    const result = await page.locator(".mascot-stage .dot-view svg").evaluate((svg) => ({
      tint: svg.querySelector('[data-r="tint"]').getAttribute("opacity"),
      grey: svg.querySelector('[data-r="fig"]').getAttribute("filter"),
      glow: svg.style.getPropertyValue("--g"),
      gradient: [...svg.querySelectorAll('linearGradient[id$="-eBody"] stop')].map((x) => x.getAttribute("stop-color")),
    }));
    expect(result.tint === "0" && !result.grey && result.glow === "rgb(63,123,255)", `Dot repintado: ${name}`);
    expect(result.gradient.join(",") === "#FFFFFF,#FBF8FF,#EDE8FC,#D8D8FA,#BCC6F8", "gradiente original alterado");
  }
});
await scenario("W5", "Aprovação com API simulada exige conteúdo visível e envia o hash exato", async ({page,open})=>{
  const raw=JSON.stringify({summary:"Fixture simulada · ação 東京",files:[{path:"result.md",content:"<script>window.UNSAFE_PROPOSAL=true</script>",beforeHash:null}]});
  const hash=createHash("sha256").update(raw).digest("hex");let decision=null;
  await page.route("**/api/runner/**",async route=>{
    const path=new URL(route.request().url()).pathname;
    let data={};
    if(path.endsWith("/plans"))data={plans:[]};
    else if(path.endsWith("/devices"))data={devices:[{id:"device-test",name:"Runner de teste",online:true,revoked:false,compatible:true,projects:[],drivers:[]}]};
    else if(path.endsWith("/tasks"))data={tasks:[{id:"task-test",deviceId:"device-test",mechanism:"codex",state:"awaiting_approval",cancelRequested:0,updatedAt:Date.now()}]};
    else if(path.endsWith("/events"))data={events:[{seq:1,kind:"proposal",text:JSON.stringify({summary:"Fixture simulada",files:[{path:"result.md",content:"<script>window.UNSAFE_PROPOSAL=true</script>",beforeHash:null}]})}],approval:{raw,hash,decision:decision?"approve":"pending",expiresAt:Date.now()+60000}};
    else if(path.endsWith("/decision")){decision=route.request().postDataJSON();data={ok:true};}
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  await open("/workspace");
  await page.getByRole("button",{name:/Codex.*Esperando sua aprovação/}).click();
  await page.getByRole("heading",{name:"result.md · arquivo novo"}).waitFor(T);
  expect(await page.getByText("<script>window.UNSAFE_PROPOSAL=true</script>",{exact:true}).isVisible(),"conteúdo da proposta não está visível");
  expect(!(await page.evaluate(()=>window.UNSAFE_PROPOSAL)),"conteúdo externo executado");
  const approve=page.getByRole("button",{name:"Aprovar estes arquivos no worktree"});
  await approve.click();
  await page.getByText("Proposta aprovada. Aguarde a confirmação de aplicação do Runner.",{exact:true}).waitFor(T);
  expect(decision?.hash===hash&&decision?.decision==="approve","aprovação sem hash exato");
  await page.screenshot({path:"test-results/runner/workspace-approval-simulated.png",fullPage:true});
});
await scenario("W6", "Payload divergente ou truncado bloqueia aprovação (API simulada)",async({page,open})=>{
  const raw=JSON.stringify({summary:"Original Unicode · ação 東京",files:[{path:"result.md",content:"whole file\n",beforeHash:null}]});
  const hash=createHash("sha256").update(raw).digest("hex");let decisions=0;
  await page.route("**/api/runner/**",async route=>{
    const path=new URL(route.request().url()).pathname;let data={};
    if(path.endsWith("/plans"))data={plans:[]};
    else if(path.endsWith("/devices"))data={devices:[{id:"device-test",name:"Runner fixture",online:true,revoked:false,compatible:true,projects:[],drivers:[]}]};
    else if(path.endsWith("/tasks"))data={tasks:[{id:"task-test",deviceId:"device-test",mechanism:"codex",state:"awaiting_approval",cancelRequested:0,updatedAt:Date.now()}]};
    else if(path.endsWith("/events"))data={events:[],approval:{raw:raw.slice(0,-3),hash,decision:"pending",expiresAt:Date.now()+60000}};
    else if(path.endsWith("/decision")){decisions++;data={};}
    await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(data)});
  });
  await open("/workspace");await page.getByRole("button",{name:/Codex.*Esperando sua aprovação/}).click();
  await page.getByText("Conteúdo completo ainda não verificado. Aprovação bloqueada.").waitFor(T);
  expect(await page.getByRole("button",{name:"Aprovar estes arquivos no worktree"}).isDisabled(),"payload truncado liberou decisão");
  expect(decisions===0,"decisão invisível enviada");
});
process.exitCode = await finish();
if (!process.exitCode) {
  process.argv.push("--dist", "apps/runner/dist");
  const nativeUI = await startHarness();
  await nativeUI.scenario("R1", "Runner web: seis etapas, sem conexão fictícia", async ({ page, open }) => {
    await page.setViewportSize({ width: 1100, height: 850 });
    await open("/");
    await page.getByRole("heading", { name: "O Dot tem um lugar no seu computador." }).waitFor(T);
    await page.getByRole("button", { name: "Etapa 3: Ambiente" }).click();
    expect(await page.getByRole("button", { name: "Verificar ambiente local" }).isDisabled(), "prévia permitiu IPC");
    await page.getByRole("button", { name: "Etapa 4: Conexão" }).click();
    expect(await page.getByRole("button", { name: "Gerar código de pareamento" }).isDisabled(), "pareamento falso");
    const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((v) => ["serious", "critical"].includes(v.impact));
    expect(!violations.length, `axe Runner: ${violations.map((v) => v.id).join(", ")}`);
    await page.screenshot({ path: "test-results/runner/runner-desktop.png", fullPage: true });
    await page.setViewportSize({ width: 360, height: 800 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "overflow Runner móvel");
    await page.screenshot({ path: "test-results/runner/runner-mobile.png", fullPage: true });
  });
  await nativeUI.scenario("R2", "Runner IPC simulado: diagnóstico, seleção e revogação aguardam confirmação", async ({ page, open }) => {
    await page.setViewportSize({ width: 1100, height: 850 });
    await page.addInitScript(() => {
      const state = { os: "test-os", arch: "test-arch", version: "0.1.0", folders: [], paired: false, drivers: [] };
      window.__TAURI__ = {
        core: {
          invoke: async (cmd, args) => {
            if (cmd === "choose_folder") state.folders.push("/test/project");
            if (cmd === "revoke_folder") state.folders.splice(args.index, 1);
            return structuredClone(state);
          },
        },
      };
    });
    await open("/");
    await page.getByRole("button", { name: "Etapa 3: Ambiente" }).click(T);
    await page.getByRole("button", { name: "Verificar ambiente local" }).click();
    await page.getByText("test-os · test-arch").waitFor(T);
    await page.getByRole("button", { name: "Etapa 5: Pastas" }).click();
    await page.getByRole("button", { name: "Escolher pasta permitida" }).click();
    await page.getByText("/test/project", { exact: true }).waitFor(T);
    await page.getByRole("button", { name: "Revogar", exact: true }).click();
    await page.getByText("/test/project", { exact: true }).waitFor({ state: "detached" });
  });
  await nativeUI.scenario("R3", "Runner mostra checkpoints preservados sem inventar conclusão (IPC fixture)", async ({ page, open }) => {
    await page.addInitScript(() => {
      window.__TAURI__ = { core: { invoke: async () => ({ os:"fixture",arch:"fixture",version:"0.1.0",folders:[],paired:false,drivers:[],checkpoints:{items:[{task:"f11c1820-5a7c-47e9-90d4-22c78ed0ca21",phase:"applied",headSha:"a".repeat(40),terminalReceipt:"completed"}],unreadable:1,truncated:false} }) } };
    });
    await open("/"); await page.getByRole("button",{name:"Etapa 6: Conclusão"}).click();
    await page.getByRole("button",{name:"Atualizar checkpoints"}).click();
    await page.getByText(/Recibo confirmado: completed/).waitFor(T);
    await page.getByText("Há registros ilegíveis. Preserve os arquivos e revise a recuperação.").waitFor(T);
    expect(await page.getByText("a".repeat(40),{exact:true}).isVisible(),"HEAD observado ausente");
  });
  process.exitCode = await nativeUI.finish();
}
