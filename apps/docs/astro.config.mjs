// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import { unified } from '@astrojs/markdown-remark';
import tailwindcss from '@tailwindcss/vite';
import { rehypeMethodChips } from './src/plugins/rehype-method-chips.mjs';

/**
 * Keeps Starlight's theme choice in sync with the product-wide `idz:theme` key and
 * `data-theme` attribute, so the preference persists across app, marketing, and docs.
 */
const themeSync = `(function(){try{
  var idz=localStorage.getItem('idz:theme');var sl=localStorage.getItem('starlight-theme');
  if(idz==='light'||idz==='dark'){document.documentElement.setAttribute('data-theme',idz);if(sl!==idz)localStorage.setItem('starlight-theme',idz);}
  else if(sl==='light'||sl==='dark'){document.documentElement.setAttribute('data-theme',sl);localStorage.setItem('idz:theme',sl);}
  var last=localStorage.getItem('starlight-theme');
  new MutationObserver(function(){var t=document.documentElement.getAttribute('data-theme');var cur=localStorage.getItem('starlight-theme');
    if(cur!==last){last=cur;if(cur==='light'||cur==='dark'){localStorage.setItem('idz:theme',cur);}else{localStorage.removeItem('idz:theme');}}
    if(t!==cur&&(cur==='light'||cur==='dark'))document.documentElement.setAttribute('data-theme',cur);
  }).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']});
}catch(e){}})();`;

export default defineConfig({
  site: 'https://docs.identizen.com',
  vite: { plugins: [tailwindcss()] },
  // Astro 7 defaults to Sätteri; the method-chip plugin is rehype, so keep the unified pipeline.
  markdown: { processor: unified({ rehypePlugins: [rehypeMethodChips] }) },
  // Astro 7 defaults to JSX whitespace rules; keep the lossless output the pages were written for.
  compressHTML: true,
  integrations: [
    starlight({
      title: 'Identizen',
      description: 'Login with your phone. Standard OIDC on the outside.',
      logo: {
        light: './src/assets/logo-light.svg',
        dark: './src/assets/logo-dark.svg',
        replacesTitle: true,
        alt: 'Identizen',
      },
      favicon: '/favicon.svg',
      customCss: ['./src/styles/theme.css'],
      components: { Hero: './src/components/Hero.astro' },
      head: [{ tag: 'script', content: themeSync }],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/identizen/platform' }],
      editLink: { baseUrl: 'https://github.com/identizen/platform/edit/main/apps/docs/' },
      lastUpdated: false,
      sidebar: [
        { label: 'Quickstart', link: '/quickstart/' },
        { label: 'Users, sign-up, and linking identities', link: '/users/' },
        { label: 'Add MFA to your existing login', link: '/add-mfa/' },
        { label: 'React (any app)', link: '/guides/react/' },
        {
          label: 'Framework guides',
          items: [
            { label: 'Next.js', link: '/guides/nextjs/' },
            { label: 'Express', link: '/guides/express/' },
            { label: 'ASP.NET Core', link: '/guides/aspnet-core/' },
            { label: 'Django', link: '/guides/django/' },
            { label: 'Plain HTML', link: '/guides/plain-html/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Verification API', link: '/reference/verification-api/' },
            { label: 'OIDC', link: '/reference/oidc/' },
            { label: 'OIDC conformance', link: '/reference/oidc-conformance/' },
            { label: 'SDK and CLI', link: '/reference/sdk/' },
            { label: 'Index API', link: '/reference/index-api/' },
            { label: 'OpenAPI', link: '/reference/openapi/' },
            { label: 'Errors', link: '/errors/' },
          ],
        },
        { label: 'Testing and CI with the fake phone', link: '/testing/' },
        { label: 'Self-hosting', link: '/self-hosting/' },
        { label: 'Running an index in production', link: '/self-hosting-production/' },
        { label: 'Embedding the index', link: '/embedding/' },
        { label: 'Examples', link: '/examples/' },
        { label: 'AI assistants and llms.txt', link: '/ai-assistants/' },
        {
          label: 'Enterprise',
          items: [
            { label: 'Overview', link: '/enterprise/' },
            { label: 'Setting up Identizen Cloud', link: '/enterprise/cloud-setup/' },
            { label: 'Administering your organization', link: '/enterprise/portal/' },
            { label: 'The organization app', link: '/enterprise/org-app/' },
            { label: 'Enrolling phones and the fleet', link: '/enterprise/enrollment/' },
            { label: 'Login policy', link: '/enterprise/policy/' },
            { label: 'MDM integration', link: '/enterprise/mdm/' },
            { label: 'MFA and step-up', link: '/enterprise/mfa-and-step-up/' },
            { label: 'SSO into your apps', link: '/enterprise/sso/' },
            { label: 'SCIM provisioning', link: '/enterprise/scim/' },
            { label: 'Compliance and operations', link: '/enterprise/compliance/' },
            { label: 'Billing', link: '/enterprise/billing/' },
            { label: 'On-prem installation', link: '/enterprise/on-prem/' },
            {
              label: 'API reference',
              items: [
                { label: 'Overview', link: '/enterprise/api/' },
                { label: 'Organization', link: '/enterprise/api/orgs/' },
                { label: 'Fleet', link: '/enterprise/api/fleet/' },
                { label: 'Policy, sites, sessions', link: '/enterprise/api/policy/' },
                { label: 'SSO', link: '/enterprise/api/sso/' },
                { label: 'SCIM', link: '/enterprise/api/scim/' },
                { label: 'Operations', link: '/enterprise/api/operations/' },
              ],
            },
          ],
        },
        { label: 'Data handling for relying parties', link: '/data-handling/' },
        { label: 'Versioning, stability, and changelog', link: '/versioning/' },
        {
          label: 'Protocol',
          items: [
            { label: 'Protocol v1', link: '/protocol/' },
            { label: 'Test vectors', link: '/protocol/vectors/' },
            { label: 'Threat model', link: '/protocol/threat-model/' },
          ],
        },
      ],
    }),
  ],
});
