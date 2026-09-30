import type { SettingsDict } from "./en";

/** Turkish settings chrome. Same shape as messages/en — a missing key is a type error, not a silent fallback. */
export const tr: SettingsDict = {
  dialogTitle: "Ayarlar",
  navLabel: "Ayar bölümleri",
  groups: {
    call: "arama",
    work: "iş",
    app: "uygulama",
    community: "topluluk",
  },
  sections: {
    thursday: {
      label: "Thursday",
      hint: "Altyazılar, modeller ve aramanın nasıl başladığı",
    },
    memory: {
      label: "Hafıza",
      hint: "Thursday'nin senin hakkında hatırladıkları",
    },
    bot: { label: "Botlar", hint: "Thursday'nin iş verdiği kişiler" },
    threads: { label: "İşler", hint: "Botlara verilen işler" },
    routines: {
      label: "Rutinler",
      hint: "Zamanlanmış, kendiliğinden başlayan işler",
    },
    files: {
      label: "Dosyalar",
      hint: "Botların bitirdikleri ve yazdıkları her şey",
    },
    skills: {
      label: "Yetenekler",
      hint: "Botların gerektiğinde yüklediği talimatlar",
    },
    mcp: {
      label: "Bağlayıcılar",
      hint: "Botların MCP sunucularından kullandığı uygulamalar",
    },
    signins: {
      label: "Girişler",
      hint: "Giriş yaptığın siteler ve her birini kullanabilen botlar",
    },
    models: {
      label: "Modeller",
      hint: "Botların neyle düşündüğü, çizdiği, çektiği ve konuştuğu",
    },
    keys: { label: "API anahtarları", hint: "Uygulamanın çalıştığı hesaplar" },
    phone: {
      label: "Telefon",
      hint: "Sohbet uygulamasından veya e-postayla Thursday'ye yaz",
    },
  },
  fileTabs: { finished: "Bitmiş", allFiles: "Tüm dosyalar" },
  tabbedLabel: "Bu bölümün ekranları",
  themeLabel: "Tema",
  themes: { system: "Sistem", light: "Açık", dark: "Koyu" },
  languageLabel: "Dil",
  languageHint: "Ayar ekranları bu dilde okunur.",
};
