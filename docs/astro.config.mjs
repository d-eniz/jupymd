// @ts-check
import autoImport from "astro-auto-import"
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightSiteGraph from 'starlight-site-graph'
//import { Prism } from "@astrojs/prism";



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
				starlightSiteGraph(),
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
				label: 'About',
				items: [
					{ label: 'Introduction', link: '/about/introduction/' }
				],
				},
				{
				label: 'Guides',
				items: [
					{ label: 'Getting Started', link: '/guides/getting-started/' },
					{ label: 'Configuring', link: '/guides/configuring/' },
					{ label: 'Selecting Interpreters', link: '/guides/selecting-interpreters/' },
				],
				},
				{
				label: 'Features',
				items: [
					{ label: 'Code Execution', link: '/features/code-execution/' },
					{ label: 'Notebook / Note Conversion', link: '/features/note-conversion/' },
					{ label: 'Syncing', link: '/features/syncing/' },
					{ label: 'Output', link: '/features/output/' },
				],
				},
				{
				label: 'Contributing',
				items: [
					{ label: 'Contribution Guidelines', link: '/contributing/contribution-guidelines/' },
					{ label: 'Prerequisites', link: '/contributing/prerequisites/' },
					{ label: 'Checking out Pull Requests', link: '/contributing/pull-requests' },
				],
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
