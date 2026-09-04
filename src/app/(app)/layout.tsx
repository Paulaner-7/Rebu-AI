import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import Nav from "@/components/nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!(await verifySession(token))) redirect("/login");
  return (
    <>
      <Nav />
      <div className="lg:pl-60">
        <div className="mx-auto w-full max-w-[1560px] px-4 pb-28 pt-6 lg:px-8 lg:pb-12 lg:pt-8">{children}</div>
      </div>
    </>
  );
}
