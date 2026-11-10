import Link from "next/link";
import { Mark } from "@/components/Mark";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-24 text-center">
      <div className="flex justify-center">
        <Mark size={56} />
      </div>
      <h1 className="font-display text-4xl sm:text-5xl font-semibold text-ink mt-6">This seat is empty</h1>
      <p className="mt-3 text-text">There&apos;s no page at this address. The circle you&apos;re after may have a different number.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link href="/circles" className="btn btn-primary">
          See all circles
        </Link>
        <Link href="/demo" className="btn btn-quiet">
          Try the demo
        </Link>
      </div>
    </div>
  );
}
