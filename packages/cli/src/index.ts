export { init, type InitOptions, type InitResult } from './commands/init';
export { dev, readIndexUrl, type DevHandle, type DevOptions } from './commands/dev';
export { registerSiteCommand, type RegisterSiteOptions } from './commands/register-site';
export {
  registerSite,
  indexHealthy,
  type RegisteredSite,
  type RegisterSiteInput,
} from './lib/index-client';
export { detectProject, type Framework, type ProjectInfo } from './lib/detect';
export { upsertEnv } from './lib/env';
export { nextTemplate, type TemplateFile } from './templates/next';
export { expressTemplate } from './templates/express';
