export const AppConfig = {
  version: '1.0.0',
  appName: 'SLIM PLAY',
  defaultWebPage: 'https://slimplay.app',
  defaultApiBase: 'https://slimplaypanel.vercel.app/api',
  userAgent: 'SlimPlay/1.0 (Tizen)',
  pageSize: 40,
  pingPath: '/devices/ping',
  activatePath: '/devices/activate',
  pinPath: '/devices/pin',
  deleteListPath: '/devices/lists/delete',
  invalidAccess: 'Dados de acesso incorretos',
} as const;
