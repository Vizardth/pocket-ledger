import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'id.pocketledger.app',
  appName: 'Pocket Ledger',
  webDir: 'www',
  plugins: {
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DEFAULT',
    },
  },
};

export default config;
