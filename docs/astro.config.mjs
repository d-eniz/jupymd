// @ts-check
import autoImport from "astro-auto-import"
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeNova from 'starlight-theme-nova'
import starlightSiteGraph from 'starlight-site-graph'

// https://astro.build/config
export default defineConfig({
	integrations: [
		autoImport({
			imports: [
				"./src/components/Stars.astro",
			]
		}),
		starlight({
			plugins: [
				starlightThemeNova(),
				starlightSiteGraph()
			],
			title: 'JupyMD Docs',
			logo: {
				dark: "./src/assets/jupymd-logo-secondary.png",
				light: "./src/assets/jupymd-logo.png",
				replacesTitle: true,
			},
			favicon: "/jupymd-icon-grey.png",
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/d-eniz/jupymd' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Getting Started', slug: 'guides/getting-started' },
					],
				},
				{
					label: 'Reference',
					autogenerate: { directory: 'reference' },
				},
			],
			customCss: [
				"./src/styles/layout.css",
				"./src/styles/brand.css",
				"./src/styles/font.css",
				"./src/styles/nova-overrides.css"
			],
			components: {
				Footer: "./src/components/Footer.astro",
				SocialIcons: "./src/components/SocialIcons.astro",
			},
		}),
	],
});
