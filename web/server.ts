import { createServer, IncomingMessage, Server, ServerResponse } from "http"
import { readFileSync } from "fs"
import { join } from "path"
import { gzipSync } from "zlib"
import * as dotenv from "dotenv"
import { clientAddress, retryAfter } from "./rateLimit"
import { bearerToken, continued, cookieFor, redeem, sessionToken } from "./webSession"
dotenv.config()

const DEFAULT_PORT = 3000
const POINT_HISTORY_ROUTE = "/api/pointHistory"
const SESSION_ROUTE = "/api/session"
const PAGE = readFileSync(join(__dirname, "pointHistoryPage.html"))

const MAX_CONNECTIONS = 200
const REQUEST_TIMEOUT_MS = 15 * 1000
const HEADERS_TIMEOUT_MS = 10 * 1000
const SOCKET_IDLE_MS = 20 * 1000
const NO_SESSION = "the link has expired or was already opened, run !history in Discord for a new one"
const TOO_MANY = "too many requests, give it a minute"
const STILL_CONNECTING = "the bot is still connecting to Discord"

let zipped: {body: string, gzip: Buffer} | undefined

const PRIVATE_HEADERS = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Robots-Tag": "noindex",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'self'; form-action 'none'; base-uri 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
}

export type PointHistoryBody = () => Promise<string | undefined>

export interface IWebServer {
    pointHistory: PointHistoryBody
    isMember: (userId: string) => Promise<boolean | undefined>
}

const send = (response: ServerResponse, status: number, type: string, body: string | Buffer, headers: Record<string, string | number> = {}): void => {
    response.writeHead(status, {...PRIVATE_HEADERS, "Content-Type": type, ...headers})
    response.end(body)
}

const forwardedProtocol = (request: IncomingMessage): string | undefined => {
    const protocol = request.headers["x-forwarded-proto"]
    return Array.isArray(protocol) ? protocol[0] : protocol
}

const overHttps = (request: IncomingMessage): boolean => forwardedProtocol(request) === "https"

const redirectedToHttps = (request: IncomingMessage, response: ServerResponse): boolean => {
    const protocol = forwardedProtocol(request)
    if (protocol === undefined || protocol === "https") return false

    response.writeHead(301, {Location: `https://${request.headers.host}${request.url}`})
    response.end()
    return true
}

const gzipped = (body: string): Buffer => {
    if (zipped?.body !== body) zipped = {body: body, gzip: gzipSync(Buffer.from(body))}
    return zipped.gzip
}

const rateLimited = (request: IncomingMessage, response: ServerResponse): boolean => {
    const wait = retryAfter(clientAddress(request.headers["x-forwarded-for"]))
    if (wait === undefined) return false

    send(response, 429, "text/plain", TOO_MANY, {"Retry-After": wait})
    return true
}

const openSession = (request: IncomingMessage, response: ServerResponse): void => {
    if (request.method !== "POST") {
        send(response, 405, "text/plain", "Method Not Allowed")
        return
    }

    const session = redeem(bearerToken(request.headers.authorization))
    if (session === undefined) {
        send(response, 401, "text/plain", NO_SESSION)
        return
    }

    send(response, 200, "text/plain", "ok", {"Set-Cookie": cookieFor(session, overHttps(request))})
}

const startWebServer = ({pointHistory, isMember}: IWebServer): Server => {
    const port = Number(process.env.PORT ?? DEFAULT_PORT)

    const server = createServer(async (request, response) => {
        if (redirectedToHttps(request, response)) return

        const route = (request.url ?? "").split("?")[0]

        if (route === "/health") {
            send(response, 200, "text/plain", "ok")
            return
        }

        if (rateLimited(request, response)) return

        if (route === "/" || route === "/index.html") {
            send(response, 200, "text/html; charset=utf-8", PAGE)
            return
        }

        if (route === SESSION_ROUTE) {
            openSession(request, response)
            return
        }

        if (route !== POINT_HISTORY_ROUTE) {
            send(response, 404, "text/plain", "Not Found")
            return
        }

        try {
            const session = continued(sessionToken(request.headers.cookie))
            if (session === undefined) {
                send(response, 401, "text/plain", NO_SESSION)
                return
            }

            const member = await isMember(session.userId)
            if (member === undefined) {
                send(response, 503, "text/plain", STILL_CONNECTING)
                return
            }

            if (!member) {
                send(response, 403, "text/plain", "you are not in the server")
                return
            }

            const body = await pointHistory()
            if (body === undefined) {
                send(response, 503, "text/plain", STILL_CONNECTING)
                return
            }

            const renewal = {"Set-Cookie": cookieFor(session, overHttps(request))}
            const wantsGzip = (request.headers["accept-encoding"] ?? "").toString().includes("gzip")

            if (wantsGzip) {
                const gzip = gzipped(body)
                send(response, 200, "application/json", gzip, {...renewal, "Content-Encoding": "gzip", "Content-Length": gzip.length})
                return
            }

            send(response, 200, "application/json", body, renewal)
        } catch (err) {
            console.log(err)
            send(response, 500, "text/plain", "Internal Server Error")
        }
    })

    server.maxConnections = MAX_CONNECTIONS
    server.requestTimeout = REQUEST_TIMEOUT_MS
    server.headersTimeout = HEADERS_TIMEOUT_MS
    server.on("connection", socket => socket.setTimeout(SOCKET_IDLE_MS, () => socket.destroy()))

    server.listen(port, () => console.log(`Serving the point history on port ${port}`))
    return server
}

export default startWebServer
