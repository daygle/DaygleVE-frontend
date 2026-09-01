<script lang="ts">
  import { page } from "$app/stores";
  import { auth } from "$lib/stores/auth";
  import { goto } from "$app/navigation";

  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/vms", label: "Virtual Machines" },
    { href: "/containers", label: "Containers" },
    { href: "/storage", label: "Storage" },
    { href: "/network", label: "Network" },
    { href: "/metrics", label: "Metrics" },
  ];

  function signOut() {
    auth.signOut();
    goto("/login");
  }
</script>

<nav>
  <div class="brand">DaygleVE</div>
  <ul>
    {#each links as link (link.href)}
      <li>
        <a
          href={link.href}
          class:active={$page.url.pathname === link.href}
        >
          {link.label}
        </a>
      </li>
    {/each}
  </ul>
  <div class="spacer"></div>
  {#if $auth.user}
    <div class="user">
      <span>{$auth.user.username}</span>
      <button onclick={signOut}>Sign out</button>
    </div>
  {/if}
</nav>

<style>
  nav {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1.25rem;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
  }
  .brand {
    font-weight: 800;
    letter-spacing: 0.02em;
    color: var(--accent);
  }
  ul {
    display: flex;
    gap: 0.25rem;
    list-style: none;
    margin: 0;
    padding: 0;
  }
  a {
    display: block;
    padding: 0.35rem 0.7rem;
    border-radius: 6px;
    color: var(--muted);
    text-decoration: none;
    font-size: 0.9rem;
  }
  a:hover {
    color: var(--fg);
    background: var(--panel-2);
  }
  a.active {
    color: var(--fg);
    background: var(--panel-2);
  }
  .spacer {
    flex: 1;
  }
  .user {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: var(--muted);
    font-size: 0.9rem;
  }
  button {
    cursor: pointer;
    background: transparent;
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
  }
  button:hover {
    color: var(--fg);
    border-color: var(--accent);
  }
</style>
