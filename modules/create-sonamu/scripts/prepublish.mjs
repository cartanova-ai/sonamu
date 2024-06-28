#!/usr/bin/env zx
import 'zx/globals'

await $`yarn build`

const { version } = JSON.parse(await fs.readFile('./package.json'))

await $`git tag -m "v${version}" v${version}`
await $`git push --follow-tags`
