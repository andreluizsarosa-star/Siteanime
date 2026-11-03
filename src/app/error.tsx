"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="container">
      <h1>Algo saiu do lugar.</h1>
      <p>Não foi possível carregar esta página.</p>
      <button onClick={reset}>Tentar novamente</button>
    </main>
  );
}
