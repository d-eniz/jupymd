// @ts-check
import autoImport from "astro-auto-import"
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightThemeNova from 'starlight-theme-nova'

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
				starlightThemeNova(/* options */), 
			],
			title: 'JupyMD Docs',
			logo: {
				dark: "../assets/jupymd-logo-secondary.png",
				light: "../assets/jupymd-logo.png",
				replacesTitle: true,
			},
			favicon: "/jupymd-icon-grey.png",
			social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/d-eniz/jupymd' }],
			sidebar: [
				{
					label: 'Guides',
					items: [
						// Each item here is one entry in the navigation menu.
						{ label: 'Example Guide', slug: 'guides/example' },
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
				SocialIcons: "./src/components/SocialIcons.astro",
			},
		}),
	],
});
