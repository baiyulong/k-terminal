function App() {
  return (
    <div className="flex h-screen w-screen">
      <aside className="w-64 border-r border-border bg-card p-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Servers
        </h2>
        <p className="mt-4 text-sm text-muted-foreground">
          No servers yet. Click + to add one.
        </p>
      </aside>
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">KTerminal</h1>
          <p className="mt-2 text-muted-foreground">
            Select a server to connect
          </p>
        </div>
      </main>
    </div>
  );
}

export default App;
