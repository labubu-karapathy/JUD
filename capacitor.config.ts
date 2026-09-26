import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.antigravity.datingapp',
  appName: 'DatingApp',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
  },
}

export default config
