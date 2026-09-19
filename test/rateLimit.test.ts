import { clientAddress, forgetAddresses, retryAfter } from "../web/rateLimit"

let failures = 0
let passes = 0

const MINUTE = 60 * 1000
const AT = new Date("2023-05-01T12:00:00Z").getTime()
const LIMIT = 60

const check = (name: string, got: string, expected: string) => {
    if (got === expected) { passes++; console.log(`  PASS  ${name}  [${got}]`) }
    else { failures++; console.log(`  FAIL  ${name} -- expected [${expected}], got [${got}]`) }
}

const requests = (address: string, count: number, at = AT): (number | undefined)[] =>
    new Array(count).fill(0).map(() => retryAfter(address, at))

const refusals = (address: string, count: number, at = AT): number =>
    requests(address, count, at).filter(wait => wait !== undefined).length

const main = async () => {
    forgetAddresses()
    check("a minute's worth of requests is allowed and the next one is refused",
        `${refusals("1.2.3.4", LIMIT)} ${refusals("1.2.3.4", 1)}`, "0 1")

    forgetAddresses()
    check("the refusal says how long is left in the window",
        `${requests("1.2.3.4", LIMIT + 1, AT + 20000).pop()}`, "60")

    forgetAddresses()
    requests("1.2.3.4", LIMIT + 5)
    check("the allowance comes back once the window has passed",
        `${refusals("1.2.3.4", 1, AT + MINUTE)}`, "0")

    forgetAddresses()
    requests("1.2.3.4", LIMIT + 5)
    check("one address running hot does not refuse anyone else",
        `${refusals("5.6.7.8", LIMIT)}`, "0")

    check("the address is read from the last entry, so a forged header cannot pin the blame elsewhere",
        clientAddress("9.9.9.9, 10.0.0.1 , 1.2.3.4"), "1.2.3.4")

    check("a request with no forwarded header is not limited",
        `${clientAddress(undefined)} ${retryAfter("", AT)}`, " undefined")

    forgetAddresses()
    check("addresses inside one IPv6 /64 share an allowance",
        `${refusals("2001:db8:1:2:3:4:5:6", LIMIT)} ${refusals("2001:0db8:1:2:aaaa::9", 1)}`, "0 1")

    forgetAddresses()
    check("IPv6 addresses in different /64s are counted apart",
        `${refusals("2001:db8:1:2::1", LIMIT)} ${refusals("2001:db8:1:3::1", 1)}`, "0 0")

    forgetAddresses()
    check("addresses arriving as IPv4 mapped into IPv6 are counted apart",
        `${refusals("::ffff:1.2.3.4", LIMIT)} ${refusals("::ffff:5.6.7.8", 1)}`, "0 0")

    forgetAddresses()
    check("an address forwarded with a port shares the allowance of the bare address",
        `${refusals("203.0.113.9:53102", LIMIT)} ${refusals("203.0.113.9", 1)}`, "0 1")

    forgetAddresses()
    check("rotating the source port is not a way around the limit",
        `${refusals("203.0.113.9:53102", LIMIT)} ${refusals("203.0.113.9:53103", 1)}`, "0 1")

    forgetAddresses()
    check("two hosts that happen to share an ephemeral port are counted apart",
        `${refusals("203.0.113.9:53102", LIMIT)} ${refusals("198.51.100.7:53102", 1)}`, "0 0")

    forgetAddresses()
    check("a bracketed IPv6 address with a port is still bucketed by its /64",
        `${refusals("[2001:db8:1:2::1]:443", LIMIT)} ${refusals("2001:db8:1:2:aaaa::9", 1)}`, "0 1")

    forgetAddresses()
    new Array(8000).fill(0).forEach((zero, index) => retryAfter(`10.0.${Math.floor(index / 256)}.${index % 256}`, AT))
    check("a flood of fresh addresses still leaves everyone else served",
        `${refusals("1.2.3.4", LIMIT)} ${refusals("1.2.3.4", 1)}`, "0 1")

    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
