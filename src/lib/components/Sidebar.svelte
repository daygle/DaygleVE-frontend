<script lang="ts">
  import { page } from "$app/stores";
  import { goto } from "$app/navigation";
  import { auth } from "$lib/stores/auth";
  import Logo from "$components/Logo.svelte";
  import Icon from "$components/Icon.svelte";

  const baseLinks = [
    { href: "/", label: "Dashboard", icon: "dashboard" },
    { href: "/vms", label: "Virtual Machines", icon: "vm" },
    { href: "/containers", label: "Containers", icon: "container" },
    { href: "/storage", label: "Storage", icon: "storage" },
    { href: "/network", label: "Network", icon: "network" },
    { href: "/metrics", label: "Metrics", icon: "metrics" },
  ];

  // The Users admin link only shows for accounts with the admin role; the API
  // enforces the permission regardless.
  const links = $derived(
    $auth.user?.roles.includes("admin")
      ? [...baseLinks, { href: "/users", label: "Users", icon: "users" }]
      : baseLinks,
  );

  // Active when the path matches exactly, or is a child of a non-root link.
  function isActive(href: string, path: string): boolean {
    return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  }

  function signOut() {
    auth.signOut();
    goto("/login");
  }
</script>

<aside class="sidebar">
  <a class="brand" href="/" aria-label="DaygleVE home">
    <Logo size={26} wordmark />
  </a>

  <nav>
    <ul>
      {#each links as link (link.href)}
        <li>
          <a href={link.href} class:active={isActive(link.href, $page.url.pathname)}>
            <Icon name={link.icon} />
            <span>{link.label}</span>
          </a>
        </li>
      {/each}
    </ul>
  </nav>

  {#if $auth.user}
    <div class="foot">
      <a class="who" href="/account" title="Account settings">
        <span class="avatar">{$auth.user.username.slice(0, 1).toUpperCase()}</span>
        <div class="meta">
          <span class="name">{$auth.user.username}</span>
          <span class="role faint">{$auth.user.roles.join(", ")}</span>
        </div>
      </a>
      <button class="signout" onclick={signOut} title="Sign out" aria-label="Sign out">
        <Icon name="logout" size={18} />
      </button>
    </div>
  {/if}
</aside>

<style>
  .sidebar {
    position: sticky;
    top: 0;
    height: 100vh;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem 0.75rem;
    background: linear-gradient(180deg, var(--panel-2), var(--bg-2));
    border-right: 1px solid var(--border);
  }
  .brand {
    display: flex;
    align-items: center;
    padding: 0.5rem 0.6rem 1rem;
  }
  .brand:hover {
    text-decoration: none;
  }
  nav {
    flex: 1;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  nav a {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    padding: 0.6rem 0.7rem;
    border-radius: var(--r-sm);
    color: var(--muted);
    font-size: 0.9rem;
    font-weight: 500;
    position: relative;
    transition:
      color 0.12s var(--ease),
      background 0.12s var(--ease);
  }
  nav a:hover {
    color: var(--fg);
    background: rgba(255, 255, 255, 0.03);
    text-decoration: none;
  }
  nav a.active {
    color: var(--fg);
    background: color-mix(in srgb, var(--brand-cyan) 12%, transparent);
  }
  nav a.active::before {
    content: "";
    position: absolute;
    left: -0.75rem;
    top: 0.4rem;
    bottom: 0.4rem;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--brand-gradient);
  }
  .foot {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.6rem;
    border-top: 1px solid var(--border);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    flex: 1;
    min-width: 0;
    color: inherit;
    border-radius: var(--r-sm);
    padding: 0.2rem;
  }
  .who:hover {
    text-decoration: none;
    background: rgba(255, 255, 255, 0.03);
  }
  .avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    font-weight: 700;
    font-size: 0.85rem;
    color: #05121a;
    background: var(--brand-gradient);
    flex: none;
  }
  .meta {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-size: 0.85rem;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .role {
    font-size: 0.72rem;
  }
  .signout {
    padding: 0.4rem;
    display: grid;
    place-items: center;
    color: var(--muted);
  }
  .signout:hover {
    color: var(--danger);
    border-color: var(--danger);
  }
</style>
