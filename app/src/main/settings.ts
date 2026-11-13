import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

export type Persona = 'normal' | 'cavaleiro';

export interface Settings {
  position?: { x: number; y: number };
  hotkey: string;
  bridgeUrl: string;
  bridgeToken: string;
  vpsHost: string;
  vpsUser: string;
  autoStart: boolean;
  ttsSpeaker: string;
  persona: Persona;
  chatPersona: Persona;
  theme: string;
  voiceServerDir: string;
  /** já perguntamos sobre instalar a voz local? evita repetir a cada boot */
  voiceInstallAsked: boolean;
  speechSide: 'left' | 'right';
  muted: boolean;
  size: string;
  idleUnloadMin: number;
  voiceEngine: 'xtts' | 'leve' | 'texto' | 'nuvem';
  windowsVoice: string;
  groqApiKey: string;
  edgeVoice: string;
  chatSessionId: string;
  /** conversa que o overlay e o chat compartilham (a última aberta no chat) */
  activeChatId: string;
  uiMode: 'overlay' | 'chat';
  chatBounds?: { x: number; y: number; width: number; height: number };
  chatPinned: boolean;
}

const defaults: Settings = {
  hotkey: 'Control+Alt+Space',
  bridgeUrl: '',
  bridgeToken: '',
  vpsHost: '',
  vpsUser: 'root',
  autoStart: false,
  ttsSpeaker: 'Damien Black',
  persona: 'cavaleiro',
  // o teatro do cavaleiro é da voz; no chat o padrão é o assistente direto
  chatPersona: 'normal',
  theme: 'dourado',
  voiceServerDir: '',
  voiceInstallAsked: false,
  speechSide: 'left',
  muted: false,
  size: 'medio',
  idleUnloadMin: 10,
  voiceEngine: 'xtts',
  windowsVoice: '',
  groqApiKey: '',
  edgeVoice: 'pt-BR-AntonioNeural',
  chatSessionId: '',
  activeChatId: '',
  uiMode: 'overlay',
  chatPinned: false,
};

// com túnel SSH ativo, a API do Hermes aparece em localhost
export function effectiveBridgeUrl(s: Settings): string {
  if (s.bridgeUrl) return s.bridgeUrl;
  if (s.vpsHost) return 'http://127.0.0.1:8642';
  return '';
}

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'settings.json');
}

// segredos vão ao disco cifrados com o DPAPI/Keychain do sistema (campo `<nome>Enc`)
const SECRETS = ['bridgeToken', 'groqApiKey'] as const;

export function loadSettings(): Settings {
  let s: Settings;
  try {
    const raw = readFileSync(settingsPath(), 'utf-8').replace(/^﻿/, '');
    const disk = JSON.parse(raw) as Record<string, unknown>;
    s = { ...defaults, ...disk };
    let migrate = false;
    for (const k of SECRETS) {
      const enc = disk[`${k}Enc`];
      if (typeof enc === 'string' && enc && safeStorage.isEncryptionAvailable()) {
        try {
          s[k] = safeStorage.decryptString(Buffer.from(enc, 'base64'));
        } catch {
          s[k] = '';
        }
      } else if (typeof disk[k] === 'string' && disk[k]) {
        migrate = true; // texto puro de versão antiga: regrava cifrado
      }
      delete (s as unknown as Record<string, unknown>)[`${k}Enc`];
    }
    if (migrate) saveSettings(s);
  } catch {
    s = { ...defaults };
  }
  return s;
}

export function saveSettings(s: Settings): void {
  mkdirSync(app.getPath('userData'), { recursive: true });
  const out: Record<string, unknown> = { ...s };
  if (safeStorage.isEncryptionAvailable()) {
    for (const k of SECRETS) {
      out[`${k}Enc`] = s[k] ? safeStorage.encryptString(s[k]).toString('base64') : '';
      delete out[k];
    }
  }
  writeFileSync(settingsPath(), JSON.stringify(out, null, 2), { encoding: 'utf-8', mode: 0o600 });
}

/** O que o renderer pode ver: segredos viram só "configurado". */
export function publicSettings(s: Settings): Settings & { bridgeTokenSet: boolean; groqApiKeySet: boolean } {
  return {
    ...s,
    bridgeToken: '',
    groqApiKey: '',
    bridgeTokenSet: Boolean(s.bridgeToken),
    groqApiKeySet: Boolean(s.groqApiKey),
  };
}

const HOST_RE = /^[A-Za-z0-9][A-Za-z0-9.:-]{0,252}$/;
const USER_RE = /^[a-z_][a-z0-9_-]{0,31}$/;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);

/** Valida o que chega do renderer em save-settings. Lança Error com a mensagem para a UI. */
export function sanitizePatch(patch: unknown, cur: Settings): Partial<Settings> {
  const p = (patch && typeof patch === 'object' ? patch : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof p[k] === 'string' ? (p[k] as string).trim() : undefined);
  const out: Partial<Settings> = {};
  const host = str('vpsHost');
  if (host !== undefined) {
    if (host && !HOST_RE.test(host)) throw new Error('Endereço da VPS inválido.');
    out.vpsHost = host;
  }
  const user = str('vpsUser');
  if (user !== undefined) {
    if (!USER_RE.test(user)) throw new Error('Usuário SSH inválido.');
    out.vpsUser = user;
  }
  const url = str('bridgeUrl');
  if (url !== undefined) {
    if (url) {
      let u: URL;
      try {
        u = new URL(url);
      } catch {
        throw new Error('Endereço do Hermes inválido.');
      }
      if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Endereço do Hermes deve ser http(s).');
      const vps = out.vpsHost ?? cur.vpsHost;
      if (!LOOPBACK.has(u.hostname) && !vps) {
        throw new Error('Sem VPS configurada, o endereço do Hermes precisa ser local (127.0.0.1).');
      }
    }
    out.bridgeUrl = url.replace(/\/$/, '');
  }
  // segredos: vazio = manter o atual (o renderer nunca recebe o valor de volta)
  for (const k of SECRETS) {
    const v = str(k);
    if (v) out[k] = v;
    if (p[`${k}Clear`] === true) out[k] = '';
  }
  const hotkey = str('hotkey');
  if (hotkey !== undefined) out.hotkey = hotkey.slice(0, 64) || 'Control+Alt+Space';
  if (typeof p.idleUnloadMin === 'number' && Number.isInteger(p.idleUnloadMin) && p.idleUnloadMin >= 0 && p.idleUnloadMin <= 1440) {
    out.idleUnloadMin = p.idleUnloadMin;
  }
  return out;
}

/** vpsUser/vpsHost já validados no save, mas o settings.json pode ter sido editado à mão. */
export function sshDest(s: Settings): string {
  const user = s.vpsUser || 'root';
  if (!USER_RE.test(user) || !HOST_RE.test(s.vpsHost)) throw new Error('vpsUser/vpsHost inválidos');
  return `${user}@${s.vpsHost}`;
}
