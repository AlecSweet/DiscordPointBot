import { continued, cookieFor, ISession, mintLink, redeem, sessionToken } from "../web/webSession"

process.env.WEB_LINK_SECRET = "test-secret"
process.env.WEB_URL = "https://points.test/"

let failures = 0
let passes = 0

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const AT = new Date("2023-05-01T12:00:00Z").getTime()

const check = (name: string, got: string, expected: string) => {
    if (got === expected) { passes++; console.log(`  PASS  ${name}  [${got}]`) }
    else { failures++; console.log(`  FAIL  ${name} -- expected [${expected}], got [${got}]`) }
}

const tokenOf = (link: string | undefined): string => `${link}`.split("#t=")[1] ?? ""

const cookieOf = (session: ISession): string => sessionToken(cookieFor(session, true, AT))

const lifetime = (session: ISession, step: number): number => {
    let carried = session
    let at = AT
    for (;;) {
        const renewed = continued(cookieOf(carried), at + step)
        if (renewed === undefined) return at - AT
        carried = renewed
        at += step
    }
}

const main = async () => {
    check("a fresh link opens a session for the user it was minted for",
        `${redeem(tokenOf(mintLink("42", AT)), AT)?.userId}`, "42")

    check("the link carries the token after the hash so it never reaches the server",
        `${mintLink("42", AT)?.split("#")[0]}`, "https://points.test/")

    check("a link that sat unopened for longer than ten minutes is refused",
        `${redeem(tokenOf(mintLink("43", AT)), AT + 11 * MINUTE)}`, "undefined")

    const forged = tokenOf(mintLink("44", AT)).replace("44.", "45.")
    check("a link with a swapped user id is refused", `${redeem(forged, AT)}`, "undefined")

    const once = tokenOf(mintLink("46", AT))
    check("a link opens one session and cannot be opened again",
        `${redeem(once, AT)?.userId} ${redeem(once, AT + MINUTE)}`, "46 undefined")

    const session = redeem(tokenOf(mintLink("47", AT)), AT)
    check("using the page renews the session to a later expiry",
        `${(continued(cookieOf(session as ISession), AT + HOUR)?.expiresAt ?? 0) - (session?.expiresAt ?? 0)}`, `${HOUR}`)

    check("a session nobody used for longer than the idle window is refused",
        `${continued(cookieOf(session as ISession), AT + 3 * DAY)}`, "undefined")

    check("renewals keep a session alive until a week after the link was minted",
        `${Math.round(lifetime(session as ISession, HOUR) / DAY)}`, "7")

    const unopened = tokenOf(mintLink("50", AT))
    check("a link handed straight to the data route as a cookie is refused, and stays unopened",
        `${continued(unopened, AT)} ${redeem(unopened, AT)?.userId}`, "undefined 50")

    check("a session cookie cannot be spent as a link",
        `${redeem(cookieOf(session as ISession), AT)}`, "undefined")

    check("the cookie is kept from scripts and from other sites",
        cookieFor(session as ISession, true, AT).split("; ").slice(1).join(" "),
        "Max-Age=172800 Path=/ HttpOnly SameSite=Strict Secure")

    check("a site published over https marks the cookie Secure whatever the request looked like",
        `${cookieFor(session as ISession, false, AT).includes("; Secure")}`, "true")

    process.env.WEB_URL = "http://localhost:3000"
    check("serving over plain http locally leaves the cookie usable",
        `${cookieFor(session as ISession, false, AT).includes("; Secure")}`, "false")
    process.env.WEB_URL = "https://points.test/"

    const elsewhere = cookieOf(session as ISession)
    process.env.WEB_LINK_SECRET = "rotated-secret"
    check("rotating the secret refuses every session that was already handed out",
        `${continued(elsewhere, AT + HOUR)}`, "undefined")

    delete process.env.WEB_LINK_SECRET
    check("no link is minted while the secret is missing", `${mintLink("48", AT)}`, "undefined")

    process.env.WEB_LINK_SECRET = "test-secret"
    delete process.env.WEB_URL
    check("no link is minted while the address is missing", `${mintLink("49", AT)}`, "undefined")

    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
