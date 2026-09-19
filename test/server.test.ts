import { request as httpRequest } from "http"
import { AddressInfo } from "net"
import startWebServer from "../web/server"
import { cookieFor, ISession, mintLink, redeem } from "../web/webSession"

process.env.WEB_LINK_SECRET = "test-secret"
process.env.WEB_URL = "http://points.test/"
process.env.PORT = "0"

let failures = 0
let passes = 0

const check = (name: string, got: string, expected: string) => {
    if (got === expected) { passes++; console.log(`  PASS  ${name}  [${got}]`) }
    else { failures++; console.log(`  FAIL  ${name} -- expected [${expected}], got [${got}]`) }
}

let member: boolean | undefined = true
let history: string | undefined = '{"people":[]}'

const cookieFrom = (userId: string): string => {
    const session = redeem(`${mintLink(userId)}`.split("#t=")[1]) as ISession
    return cookieFor(session, false).split(";")[0]
}

const main = async () => {
    const server = startWebServer({
        pointHistory: () => Promise.resolve(history),
        isMember: () => Promise.resolve(member),
    })
    await new Promise<void>(resolve => server.once("listening", () => resolve()))
    const port = (server.address() as AddressInfo).port

    const get = (path: string, headers: Record<string, string> = {}): Promise<string> =>
        new Promise((resolve, reject) => {
            const sent = httpRequest({host: "127.0.0.1", port: port, path: path, headers: headers, agent: false}, response => {
                let text = ""
                response.setEncoding("utf8")
                response.on("data", chunk => { text += chunk })
                response.on("end", () => resolve(`${response.statusCode} ${text}`))
            })
            sent.on("error", err => reject(new Error(`GET ${path} failed: ${(err as Error).message}`)))
            sent.end()
        })

    const history_ = (userId = "42"): Promise<string> => get("/api/pointHistory", {cookie: cookieFrom(userId)})

    check("the health route answers without a session", await get("/health"), "200 ok")

    check("an unknown api route is not found",
        await get("/api/nothing"), "404 Not Found")

    check("the point history needs a session",
        await get("/api/pointHistory"),
        "401 the link has expired or was already opened, run !history in Discord for a new one")

    member = undefined
    check("a member who opens their link before the bot has its guild is told to wait, not that they are a stranger",
        await history_(), "503 the bot is still connecting to Discord")

    member = false
    check("someone who really is not in the server is refused",
        await history_(), "403 you are not in the server")

    member = true
    history = undefined
    check("a guild that goes away between the two checks still reads as connecting",
        await history_(), "503 the bot is still connecting to Discord")

    history = '{"people":[]}'
    check("a member with a live session is served the history",
        await history_(), '200 {"people":[]}')

    const flood = async (path: string, address: string): Promise<string> => {
        let last = ""
        for (let sent = 0; sent < 61; sent++) last = await get(path, {"x-forwarded-for": address})
        return last
    }

    check("the unauthenticated page is throttled too, not just the data route",
        (await flood("/", "203.0.113.50")).split(" ")[0], "429")

    check("health checks are never throttled",
        (await flood("/health", "203.0.113.51")), "200 ok")

    server.close()
    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
