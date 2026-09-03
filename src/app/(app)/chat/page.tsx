import ChatBox from "./chatbox";
import { Eyebrow } from "@/components/ui";

export default function Page() {
  return (
    <main className="flex flex-col gap-3">
      <header>
        <Eyebrow>Assistente</Eyebrow>
        <h1 className="font-display mt-2 text-3xl font-extrabold uppercase tracking-tight">Chat</h1>
      </header>
      <ChatBox />
    </main>
  );
}
