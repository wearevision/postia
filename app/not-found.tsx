import NoEncontrada from "./(app)/not-found"

export default function NoEncontradaGlobal() {
  return (
    <main className="px-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <NoEncontrada />
    </main>
  )
}
