export { init, type InitOptions, type InitResult } from './commands/init.js';
export { dev, readIndexUrl, type DevHandle, type DevOptions } from './commands/dev.js';
export { registerSiteCommand, type RegisterSiteOptions } from './commands/register-site.js';
export {
  registerSite,
  indexHealthy,
  type RegisteredSite,
  type RegisterSiteInput,
} from './lib/index-client.js';
export { detectProject, type Framework, type ProjectInfo } from './lib/detect.js';
export { upsertEnv } from './lib/env.js';
export { nextTemplate, type TemplateFile } from './templates/next.js';
export { expressTemplate } from './templates/express.js';
