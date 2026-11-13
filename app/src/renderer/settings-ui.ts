import './types.d';

const $ = (id: string) => document.getElementById(id) as HTMLInputElement;

// Segredos nunca voltam do processo principal: o campo fica vazio e o placeholder
// diz se há valor salvo. Vazio ao salvar = manter o atual.
function setSecret(id: string, configured: boolean): void {
  const el = $(id);
  el.value = '';
  el.placeholder = configured ? 'configurado — deixe vazio para manter' : 'não configurado';
}

for (const id of ['bridgeToken', 'groqApiKey'] as const) {
  document.getElementById(`clear-${id}`)!.addEventListener('click', async () => {
    await window.hermes.saveSettings(id === 'bridgeToken' ? { bridgeTokenClear: true } : { groqApiKeyClear: true });
    await load();
  });
}

document.getElementById('btn-voice-dir')!.addEventListener('click', async () => {
  const s = await window.hermes.pickVoiceDir();
  $('voiceServerDir').value = s.voiceServerDir;
  pintarVoz(s.voiceServerDir);
});

async function load(): Promise<void> {
  const s = await window.hermes.getSettings();
  $('vpsHost').value = s.vpsHost;
  $('vpsUser').value = s.vpsUser;
  $('bridgeUrl').value = s.bridgeUrl;
  setSecret('bridgeToken', s.bridgeTokenSet);
  setSecret('groqApiKey', s.groqApiKeySet);
  $('voiceServerDir').value = s.voiceServerDir;
  pintarVoz(s.voiceServerDir);
  $('hotkey').value = s.hotkey;
  ($('idleUnload') as unknown as HTMLSelectElement).value = String(s.idleUnloadMin);
}

async function saveAll(): Promise<boolean> {
  const status = document.getElementById('status')!;
  try {
    await window.hermes.saveSettings({
      bridgeUrl: $('bridgeUrl').value.trim(),
      vpsHost: $('vpsHost').value.trim(),
      vpsUser: $('vpsUser').value.trim() || 'root',
      bridgeToken: $('bridgeToken').value.trim(),
      groqApiKey: $('groqApiKey').value.trim(),
      hotkey: $('hotkey').value.trim() || 'Control+Alt+Space',
      idleUnloadMin: parseInt(($('idleUnload') as unknown as HTMLSelectElement).value, 10) || 0,
    });
  } catch (e) {
    // erro de validação do processo principal ("Error invoking remote method ...: Error: <msg>")
    status.textContent = String(e instanceof Error ? e.message : e).replace(/^.*Error: /, '');
    status.className = 'err';
    return false;
  }
  await load();
  return true;
}

document.getElementById('btn-save')!.addEventListener('click', async () => {
  if (!(await saveAll())) return;
  const saved = document.getElementById('saved')!;
  saved.classList.remove('hidden');
  setTimeout(() => saved.classList.add('hidden'), 2500);
});

document.getElementById('btn-key')!.addEventListener('click', async () => {
  const { authorizeCommand } = await window.hermes.genSshKey();
  ($('key-cmd') as unknown as HTMLTextAreaElement).value = authorizeCommand;
  document.getElementById('key-area')!.classList.remove('hidden');
});

document.getElementById('btn-copy')!.addEventListener('click', () => {
  navigator.clipboard.writeText(($('key-cmd') as unknown as HTMLTextAreaElement).value);
});

document.getElementById('btn-vps-setup')!.addEventListener('click', async () => {
  const status = document.getElementById('status')!;
  // salva tudo que foi digitado antes do setup — o load() do final recarrega o
  // formulário, e um save parcial descartaria os outros campos (ex.: chave Groq)
  if (!(await saveAll())) return;
  status.textContent = 'Configurando a VPS… (até 30 s)';
  status.className = '';
  const r = await window.hermes.vpsSetup();
  status.textContent = r.message;
  status.className = r.ok ? 'ok' : 'err';
  // o token já foi gerado e salvo mesmo no sucesso parcial (container sem reiniciar,
  // porta 8642 fechada) — sem recarregar, o campo fica vazio e parece que falhou tudo
  if (r.tokenSet) load();
});

document.getElementById('btn-test')!.addEventListener('click', async () => {
  const status = document.getElementById('status')!;
  status.textContent = 'Testando…';
  status.className = '';
  const r = await window.hermes.testBridge();
  status.textContent = r.message;
  status.className = r.ok ? 'ok' : 'err';
});

// ---- voz local ----
const voiceState = document.getElementById('voice-state')!;
const voiceBtn = document.getElementById('btn-voice-install') as HTMLButtonElement;
const voiceProg = document.getElementById('voice-progress')!;

function pintarVoz(dir: string): void {
  if (dir) {
    voiceState.textContent = `Instalada em: ${dir}`;
    voiceBtn.textContent = 'Reinstalar voz local';
  } else {
    voiceState.textContent = 'Não instalada.';
    voiceBtn.textContent = 'Instalar voz local';
  }
}

window.hermes.onVoiceInstallProgress(({ etapa, detalhe }) => {
  voiceProg.classList.remove('hidden');
  document.getElementById('voice-etapa')!.textContent = etapa;
  document.getElementById('voice-detalhe')!.textContent = detalhe ?? '';
});

async function instalarVoz(): Promise<void> {
  if (voiceBtn.disabled) return;
  voiceBtn.disabled = true;
  voiceProg.classList.remove('hidden');
  document.getElementById('voice-etapa')!.textContent = 'Iniciando…';
  const r = await window.hermes.voiceInstall();
  document.getElementById('voice-etapa')!.textContent = r.message;
  document.getElementById('voice-detalhe')!.textContent = '';
  voiceBtn.disabled = false;
  if (r.ok) await load();
}

voiceBtn.addEventListener('click', instalarVoz);
window.hermes.onVoiceInstallAuto(() => void instalarVoz());

load();
