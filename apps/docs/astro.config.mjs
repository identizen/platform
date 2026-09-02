// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
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
  markdown: { rehypePlugins: [rehypeMethodChips] },
  integrations: [
    starlight({
      title: 'Identizen',
      description: 'Login with your phone. Standard OIDC on the outside.',
      logo: { src: './src/assets/logo.svg', replacesTitle: false },
      customCss: ['./src/styles/theme.css'],
      components: { Hero: './src/components/Hero.astro' },
      head: [{ tag: 'script', content: themeSync }],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/identizen/platform' }],
      editLink: { baseUrl: 'https://github.com/identizen/platform/edit/main/apps/docs/' },
      lastUpdated: false,
      sidebar: [
        { label: 'Quickstart', link: '/quickstart/' },
        { label: 'Add MFA to your existing login', link: '/add-mfa/' },
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
            { label: 'SDK and CLI', link: '/reference/sdk/' },
            { label: 'Index API', link: '/reference/index-api/' },
            { label: 'Errors', link: '/errors/' },
          ],
        },
        { label: 'Self-hosting', link: '/self-hosting/' },
        { label: 'Enterprise', link: '/enterprise/' },
        {
          label: 'Protocol',
          items: [
            { label: 'Protocol v1', link: '/protocol/' },
            { label: 'Test vectors', link: '/protocol/vectors/' },
          ],
        },
      ],
    }),
  ],
});
