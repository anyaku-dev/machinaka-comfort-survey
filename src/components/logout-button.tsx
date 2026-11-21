"use client";
import { useRouter } from "next/navigation";
import { browserClient } from "@/lib/supabase/browser";

export default function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn-small"
      onClick={async () => {
        await browserClient().auth.signOut();
        router.push("/login");
      router.refresh();
      }}
    >
      ログアウト
    </button>
  );
}
