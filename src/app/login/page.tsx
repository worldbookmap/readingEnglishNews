import { login } from "@/app/actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { error, next } = await searchParams;
  return (
    <div className="mx-auto mt-24 max-w-sm">
      <h1 className="mb-6 text-center font-serif text-3xl font-semibold">
        Reading<span className="text-accent">.</span>
      </h1>
      <form action={login} className="space-y-3 rounded-2xl border border-line bg-card p-6">
        <input type="hidden" name="next" value={typeof next === "string" ? next : "/"} />
        <input
          type="password"
          name="password"
          autoFocus
          required
          placeholder="비밀번호"
          className="w-full rounded-lg border border-line bg-paper px-3 py-2 outline-none focus:border-ink/40"
        />
        {error && <p className="text-sm text-accent">비밀번호가 맞지 않아요.</p>}
        <button type="submit" className="w-full rounded-lg bg-ink py-2 font-medium text-paper">
          들어가기
        </button>
      </form>
    </div>
  );
}
