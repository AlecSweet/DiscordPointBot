import { Message } from "discord.js"
import { peakCandidates } from "../scripts/backfillMaxPoints"
import { betFacts, linkBets, observe } from "../scripts/observePointHistory"

const ESC = String.fromCharCode(27)

let failures = 0
let passes = 0

const fake = (content: string, repliedUser?: string) => ({
    id: "bot",
    channelId: "channel",
    content: content,
    createdAt: new Date("2023-05-01T12:00:00Z"),
    editedAt: null,
    reference: repliedUser ? {messageId: "cmd"} : null,
    attachments: {find: () => undefined},
    mentions: {repliedUser: repliedUser ? {id: repliedUser} : null},
    interaction: null
}) as unknown as Message<boolean>

const candidatesOf = (message: Message<boolean>) => peakCandidates(observe(message).concat(linkBets(betFacts(message))))

const summarize = (message: Message<boolean>): string => candidatesOf(message)
    .map(candidate => `${candidate.userId}:${candidate.balance}(${candidate.source})`)
    .join(", ")

const peakOf = (message: Message<boolean>, userId: string): number => Math.max(...candidatesOf(message)
    .filter(candidate => candidate.userId === userId)
    .map(candidate => candidate.balance))

const check = (name: string, got: string, expected: string) => {
    if (got === expected) { passes++; console.log(`  PASS  ${name}  [${got}]`) }
    else { failures++; console.log(`  FAIL  ${name} -- expected [${expected}], got [${got}]`) }
}

const tests: {name: string, message: Message<boolean>, expected: string}[] = [
    {name: "a flip loss offers the balance it left and the higher one it started from",
        message: fake(`:smodge: 50 points deleted, later. You're down to 900 points. You rolled 20 of 256`, "111"),
        expected: "111:900(flip), 111:950(before flip)"},
    {name: "a gift offers the giver's balances but nothing for the receiver, whose balance is unknown",
        message: fake(`You gave <@333> 20 points :nice: You now have 480 points`, "111"),
        expected: "111:480(giftSent), 111:500(before giftSent)"},
    {name: "a balance shown on request is a candidate",
        message: fake(`<@222> has 700 points`, "111"),
        expected: "222:700(balanceShown)"},
    {name: "a claim shows no balance, so it offers nothing",
        message: fake(`You got your daily 30 :dogegejam:`, "111"),
        expected: ""},
    {name: "a winning bet offers the balance it paid out to",
        message: fake(`<@111> won 150 points <:nice:1> and now has 650 points`),
        expected: "111:650(balanceShown)"},
    {name: "a war offers both whole balances and the winner's pot",
        message: fake(`War accepted by <@222> <:pepo_smash:1>\`\`\`   alice | bob
Bet  500 | 300 ⠀
1) W 800 | 0    \`\`\`<@222> got dusted <:smodge:2>
<@111> won 300 points <:nice:3>`),
        expected: "111:0(warEscrow), 111:500(before warEscrow), 222:0(warEscrow), 222:300(before warEscrow), 111:800(warPayout), 111:0(before warPayout)"},
]

const main = async () => {
    for (const test of tests) {
        check(test.name, summarize(test.message), test.expected)
    }

    check("a martingale run peaks before the losing streak that busted it", String(peakOf(fake(`**<@999>'s Martinelli**
\`\`\`ansi
Points: 400 (${ESC}[0;31m-600${ESC}[0m)   Win: 1/5   Next Bet: 800

1) ✅ 100
2) ❌ 100  ❌ 200  ❌ 400
\`\`\`
You ain't got 800. Sit`), "999")), "1100")

    check("a busted flip-all run on the net panel peaks at its last doubling", String(peakOf(fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 0     Net: ${ESC}[0;31m-300${ESC}[0m     Flip: 3 of 5
W: 2     L: 1

✅ ✅ ❌
\`\`\`
Sit`), "888")), "1200")

    check("a fixed-bet run on the net panel peaks inside the run, above both of its ends", String(peakOf(fake(`**<@888>'s Flips**
\`\`\`ansi
Points: 50     Net: ${ESC}[0;31m-100${ESC}[0m     Flip: 3 of 5
W: 1     L: 2

✅ ❌ ❌
\`\`\`
You ain't got 100. Sit`), "888")), "250")

    console.log(`\n${passes} passed, ${failures} failed`)
    process.exit(failures > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(1) })
