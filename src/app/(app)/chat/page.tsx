import ChatBox from "./chatbox";

export default function Page() {
  return (
    <main className="flex flex-col gap-3">
      <h1 className="text-2xl font-bold">Chat</h1>
      <ChatBox />
    </main>
  );
}
