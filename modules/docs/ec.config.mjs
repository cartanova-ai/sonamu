import { pluginCollapsibleSections } from '@expressive-code/plugin-collapsible-sections'

/** @type {import('@astrojs/starlight/expressive-code').StarlightExpressiveCodeOptions} */
export default {
  // Example: Using a custom plugin (which makes this `ec.config.mjs` file necessary)
  plugins: [pluginCollapsibleSections()],
  // ... any other options you want to configure
}