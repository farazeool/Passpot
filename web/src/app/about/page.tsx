import type { Metadata } from "next";
import Link from "next/link";
import { REPO_URL } from "@/lib/config";
import { Tilt } from "@/components/Tilt";

export const metadata: Metadata = {
  title: "About Passpot",
  description: "Why Passpot exists, why it runs on NEAR, and where it goes next.",
};

const WHY_NEAR: [string, string][] = [
  [
    "Fees too small to notice",
    "A circle pays in every month for a year. On NEAR each payment costs a fraction of a cent, so the fees never eat into a 50-dollar contribution.",
  ],
  [
    "Names people can read",
    "Accounts can have names like ayesha.near instead of a long string of characters, so you can see at a glance who is in your circle.",
  ],
  [
    "A vault per circle",
    "Each circle gets its own Sputnik DAO, a well-tested NEAR contract for holding shared money. Passpot's rules are its only council member.",
  ],
  [
    "Profiles that travel",
    "Profiles live on NEAR Social and savings records in the Passpot contract, so any NEAR app can read them. Your record isn't locked inside Passpot.",
  ],
];

const COMPARE: [string, string, string][] = [
  [
    "The organizer runs off",
    "The contract holds the pot.",
    "Each circle's own Sputnik DAO holds it, and the Passpot contract has no keys, so nobody can change the rules. The Verify page proves both.",
  ],
  [
    "An early winner stops paying",
    "The members still waiting lose out, or have to vote on what to do.",
    "Part of an early pot is held back and released round by round. A missed payment is covered automatically, from holdback first, then the member's deposit.",
  ],
  [
    "Arguing over who goes first",
    "One fixed order.",
    "A lucky draw anyone can replay, an agreed order, or bidding, where a member gives up a little to go sooner and the others share it.",
  ],
  [
    "The money loses value",
    "Contributions in a coin whose price moves.",
    "Contributions in dollars (testUSD here, USDC on mainnet), so a 100-dollar pot stays 100 dollars.",
  ],
  [
    "Strangers can't be trusted",
    "Anyone joins on equal terms.",
    "A savings record follows each member. It sets how much is held back and lets an organizer accept only people with clean circles.",
  ],
  [
    "Trying it out",
    "Connect a wallet and fund it first.",
    "One click: a live demo circle with three members you can act as, no wallet needed.",
  ],
];

const NEXT: [string, string][] = [
  ["Private circles", "People ask to join, and the organizer approves them by their profile and on-chain savings record."],
  ["Swap turns", "Two members of an agreed-order circle trade payout rounds when both say yes."],
  ["Pay ahead", "Cover two or three rounds in advance, for irregular incomes and time away."],
  ["Pay from anywhere", "Family abroad pays a member's share directly, from any chain, through NEAR Intents."],
  ["Real dollars", "The same contract on NEAR mainnet with USDC, once it has been audited."],
  ["Urdu and Arabic", "The interface and WhatsApp reminders in the languages most circles are run in."],
];

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-12 sm:py-16">
      <div className="max-w-3xl">
        <p className="text-sm font-semibold text-muted">About Passpot</p>
        <h1 className="mt-2 font-display text-4xl sm:text-6xl font-semibold text-ink">
          Saving together shouldn&apos;t depend on trusting one person.
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-text">
          Savings circles are one of the oldest ways ordinary people get a lump sum without a bank or a loan. In
          Pakistan it&apos;s a committee, in Ghana a susu, in Mexico a tanda, in Kenya a chama. Millions of families
          use them to pay for weddings, school fees, a shop&apos;s stock or a motorbike.
        </p>
        <p className="mt-4 text-lg sm:text-xl text-text">
          They share the same weak spots: the money sits with the organizer, and the record is a notebook. When the
          organizer disappears or a member stops paying, the circle collapses, which is why so many circles never
          grow beyond close family.
        </p>
      </div>

      <section className="mt-16 grid gap-6 lg:grid-cols-3" aria-label="What Passpot changes">
        {[
          ["The money", "sits in the circle's own vault, not in anyone's pocket. Only the circle's rules can move it, not the organizer."],
          ["The turns", "are decided by an on-chain draw, the agreed order or a bid. Anyone can check every result."],
          ["The trust", "is earned. Every payment builds an on-chain savings record, and a good record means less held back."],
        ].map(([t, d]) => (
          <Tilt key={t} max={5} className="card p-6">
            <p className="font-display text-2xl font-semibold text-ink">{t}</p>
            <p className="mt-2 text-text">{d}</p>
          </Tilt>
        ))}
      </section>

      <section className="mt-20" aria-labelledby="beyond">
        <h2 id="beyond" className="font-display text-3xl sm:text-4xl font-semibold text-ink">
          A contract holding the pot is only step one
        </h2>
        <p className="mt-4 max-w-3xl text-lg text-text">
          Putting the money in a smart contract stops the organizer running off. Circles break in other ways too, and
          Passpot handles those in the contract as well.
        </p>
        <div className="mt-8 overflow-x-auto rounded-2xl border border-rule">
          <table className="w-full min-w-[640px] text-left">
            <thead className="bg-paper text-sm text-muted">
              <tr>
                <th className="px-5 py-3 font-semibold">What goes wrong</th>
                <th className="px-5 py-3 font-semibold">A basic on-chain circle</th>
                <th className="px-5 py-3 font-semibold text-ink">Passpot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {COMPARE.map(([problem, basic, ours]) => (
                <tr key={problem} className="align-top">
                  <td className="px-5 py-4 font-semibold text-ink">{problem}</td>
                  <td className="px-5 py-4 text-muted">{basic}</td>
                  <td className="px-5 py-4 text-text">{ours}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-20" aria-labelledby="near">
        <h2 id="near" className="font-display text-3xl sm:text-4xl font-semibold text-ink">
          Why it runs on NEAR
        </h2>
        <dl className="mt-8 grid gap-x-10 gap-y-8 md:grid-cols-2">
          {WHY_NEAR.map(([t, d]) => (
            <div key={t} className="border-t border-rule pt-5">
              <dt className="font-semibold text-ink text-lg">{t}</dt>
              <dd className="mt-1.5 text-text">{d}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="mt-20" aria-labelledby="next">
        <h2 id="next" className="font-display text-3xl sm:text-4xl font-semibold text-ink">
          Where it goes next
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {NEXT.map(([t, d], i) => (
            <li key={t}>
              <Tilt max={5} className="card h-full p-6">
                <span className="font-display text-sm font-semibold text-marigold num">0{i + 1}</span>
                <p className="mt-2 font-display text-xl font-semibold text-ink">{t}</p>
                <p className="mt-1.5 text-text">{d}</p>
              </Tilt>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-20 rounded-3xl bg-band text-band-fg p-8 sm:p-12" aria-labelledby="honest">
        <h2 id="honest" className="font-display text-3xl font-semibold">What it doesn&apos;t do yet</h2>
        <ul className="mt-5 space-y-3 text-lg opacity-85 max-w-3xl list-disc pl-5">
          <li>It runs on NEAR testnet with test dollars that have no value. Real money comes after an audit.</li>
          <li>
            Holdback and deposits cover missed payments, but a member who already had the pot and walks away can
            still leave a gap bigger than what was held back.
          </li>
          <li>Anyone with an invite link can take a seat, until private circles arrive.</li>
        </ul>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo" className="btn btn-pot">
            Try a demo circle
          </Link>
          {REPO_URL && (
            <a href={REPO_URL} className="btn btn-quiet" rel="noreferrer">
              Read the code
            </a>
          )}
        </div>
      </section>
    </div>
  );
}
