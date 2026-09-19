import { createHmac, timingSafeEqual } from "crypto"
import * as dotenv from "dotenv"
dotenv.config()

const LINK_MS = 10 * 60 * 1000
const IDLE_MS = 2 * 24 * 60 * 60 * 1000
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000

const COOKIE_NAME = "pointHistory"

export interface ISession {
    userId: string
    issuedAt: number
    expiresAt: number
}

const redeemed = new Map<string, number>()

const sign = (payload: string): string =>
    createHmac("sha256", `${process.env.WEB_LINK_SECRET}`).update(payload).digest("base64url")

type IPurpose = "link" | "session"

const signed = (purpose: IPurpose, session: ISession): string => {
    const payload = `${purpose}.${session.userId}.${session.issuedAt}.${session.expiresAt}`
    return `${payload}.${sign(payload)}`
}

const sameSignature = (given: string, expected: string): boolean => {
    const from = Buffer.from(given)
    const against = Buffer.from(expected)
    return from.length === against.length && timingSafeEqual(from, against)
}

const configured = (): boolean => (process.env.WEB_LINK_SECRET ?? "").length > 0

const opened = (purpose: IPurpose, token: string, now: number): ISession | undefined => {
    if (!configured()) return undefined

    const [kind, userId, issuedAt, expiresAt, signature] = token.split(".")
    if (kind !== purpose || userId === undefined || signature === undefined) return undefined
    if (!sameSignature(signature, sign(`${kind}.${userId}.${issuedAt}.${expiresAt}`))) return undefined

    return Number(expiresAt) > now ? {userId: userId, issuedAt: Number(issuedAt), expiresAt: Number(expiresAt)} : undefined
}

const renewed = (session: ISession, now: number): ISession | undefined =>
    now - session.issuedAt > ABSOLUTE_MS ? undefined : {
        userId: session.userId,
        issuedAt: session.issuedAt,
        expiresAt: Math.min(now + IDLE_MS, session.issuedAt + ABSOLUTE_MS),
    }

const forgetRedeemed = (now: number): void => {
    redeemed.forEach((expiresAt, token) => {
        if (expiresAt <= now) redeemed.delete(token)
    })
}

export const mintLink = (userId: string, now = Date.now()): string | undefined => {
    const base = `${process.env.WEB_URL ?? ""}`.replace(/\/+$/, "")
    if (!configured() || base.length === 0) return undefined

    return `${base}/#t=${signed("link", {userId: userId, issuedAt: now, expiresAt: now + LINK_MS})}`
}

export const redeem = (token: string, now = Date.now()): ISession | undefined => {
    const link = opened("link", token, now)
    if (link === undefined) return undefined

    forgetRedeemed(now)
    if (redeemed.has(token)) return undefined
    redeemed.set(token, link.expiresAt)

    return renewed(link, now)
}

export const continued = (token: string, now = Date.now()): ISession | undefined => {
    const session = opened("session", token, now)
    return session === undefined ? undefined : renewed(session, now)
}

const publishedOverHttps = (): boolean => `${process.env.WEB_URL ?? ""}`.startsWith("https:")

export const cookieFor = (session: ISession, overHttps: boolean, now = Date.now()): string =>
    `${COOKIE_NAME}=${signed("session", session)}; Max-Age=${Math.floor((session.expiresAt - now) / 1000)}`
    + `; Path=/; HttpOnly; SameSite=Strict${overHttps || publishedOverHttps() ? "; Secure" : ""}`

export const sessionToken = (cookies: string | undefined): string =>
    `${cookies ?? ""}`.split(";")
        .map(cookie => cookie.trim())
        .filter(cookie => cookie.startsWith(`${COOKIE_NAME}=`))
        .map(cookie => cookie.slice(COOKIE_NAME.length + 1))[0] ?? ""

export const bearerToken = (authorization: string | string[] | undefined): string =>
    `${authorization ?? ""}`.replace(/^Bearer /, "")
