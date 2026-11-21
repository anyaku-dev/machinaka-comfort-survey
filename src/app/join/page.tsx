import type { Metadata } from "next";
import JoinClient from "./join-client";

export const metadata: Metadata = { title: "調査に参加｜まちなか居心地調査", referrer: "no-referrer" };

export default function JoinPage() {
  return <JoinClient />;
}
