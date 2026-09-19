import { randomBytes } from "crypto"
import { readFileSync } from "fs"
import startWebServer from "../web/server"
import { mintLink } from "../web/webSession"

const DEFAULT_IN = "pointHistory.json"

const argv = process.argv.slice(2)

const option = (name: string): string | undefined => {
    const index = argv.indexOf(name)
    return index === -1 ? undefined : argv[index + 1]
}

const main = () => {
    const inPath = option("--in") ?? DEFAULT_IN
    const port = option("--port")
    if (port !== undefined) process.env.PORT = port

    if (process.env.WEB_LINK_SECRET === undefined) process.env.WEB_LINK_SECRET = randomBytes(32).toString("hex")
    process.env.WEB_URL = `http://localhost:${process.env.PORT ?? 3000}`

    const snapshot = readFileSync(inPath, "utf8")
    JSON.parse(snapshot)

    startWebServer({pointHistory: () => Promise.resolve(snapshot), isMember: () => Promise.resolve(true)})
    console.log(`serving ${inPath}, open ${mintLink("local")}`)
}

if (require.main === module) {
    main()
}
