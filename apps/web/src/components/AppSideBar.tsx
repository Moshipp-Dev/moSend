"use client";

import {
  BookUser,
  Code,
  Cog,
  MessageSquare,
  Globe,
  LayoutTemplate,
  Mail,
  Server,
  Volume2,
  BookOpenText,
  BarChart3,
  LogOutIcon,
  MoreVerticalIcon,
  UsersIcon,
  GaugeIcon,
  UserRoundX,
  Webhook,
} from "lucide-react";
import { signOut } from "next-auth/react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@usesend/ui/src/sidebar";
import Link from "next/link";
import { MiniThemeSwitcher, ThemeSwitcher } from "./theme/ThemeSwitcher";
import { useSession } from "next-auth/react";
import { isCloud, isSelfHosted } from "~/utils/common";
import { usePathname } from "next/navigation";
import { useTeam } from "~/providers/team-context";
import { Badge } from "@usesend/ui/src/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@usesend/ui/src/avatar";
import Image from "next/image";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@usesend/ui/src/dropdown-menu";
import { FeedbackDialog } from "./FeedbackDialog";
import { env } from "~/env";

// General items
const generalItems = [
  {
    title: "Analíticas",
    url: "/dashboard",
    icon: BarChart3,
  },
  {
    title: "Correos",
    url: "/emails",
    icon: Mail,
  },
  {
    title: "Plantillas",
    url: "/templates",
    icon: LayoutTemplate,
    clientHidden: true,
  },
  {
    title: "Supresiones",
    url: "/suppressions",
    icon: UserRoundX,
    clientHidden: true,
  },
];

// Marketing items
const marketingItems = [
  {
    title: "Contactos",
    url: "/contacts",
    icon: BookUser,
  },
  {
    title: "Campañas",
    url: "/campaigns",
    icon: Volume2,
  },
];

// Settings items
const settingsItems = [
  {
    title: "Dominios",
    url: "/domains",
    icon: Globe,
  },
  {
    title: "Webhooks",
    url: "/webhooks",
    icon: Webhook,
  },
  {
    title: "Configuración de desarrollador",
    url: "/dev-settings",
    icon: Code,
  },
  {
    title: "Configuración",
    url: "/settings",
    icon: Cog,
  },
  // Admin item shows if user is admin OR if it's self-hosted
  {
    title: "Administración",
    url: "/admin",
    icon: Server,
    isAdmin: true,
    isSelfHosted: true,
  },
];

export function AppSidebar() {
  const { data: session } = useSession();
  const { currentIsClient } = useTeam();
  const showFeedback = isCloud();

  const pathname = usePathname();

  return (
    <Sidebar collapsible="icon" variant="sidebar">
      <SidebarHeader>
        <SidebarGroupLabel>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground font-mono">
              moSend
            </span>
            <Badge variant="outline">Beta</Badge>
          </div>
        </SidebarGroupLabel>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>
            <span>General</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {generalItems.map((item) => {
                if (currentIsClient && item.clientHidden) return null;
                const isActive = pathname?.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActive}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        {!currentIsClient && (
        <SidebarGroup>
          <SidebarGroupLabel>
            <span>Marketing</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {marketingItems.map((item) => {
                const isActive = pathname?.startsWith(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActive}
                      className="text-sidebar-foreground"
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}
        <SidebarGroup>
          <SidebarGroupLabel>
            <span>Settings</span>
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {settingsItems.map((item) => {
                const isActive = pathname?.startsWith(item.url);

                // Hide webhooks, developer settings and admin from CLIENT users
                if (currentIsClient && (item.url === "/webhooks" || item.url === "/admin" || item.url === "/settings")) {
                  return null;
                }

                // Special case for Admin item: show if user is admin OR if it's self-hosted
                if (item.isAdmin && item.isSelfHosted) {
                  if (!session?.user.isAdmin && !isSelfHosted()) {
                    return null;
                  }
                } else {
                  // Regular admin-only items
                  if (item.isAdmin && !session?.user.isAdmin) {
                    return null;
                  }
                  // Regular self-hosted-only items
                  if (item.isSelfHosted && !isSelfHosted()) {
                    return null;
                  }
                }
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      tooltip={item.title}
                      isActive={isActive}
                    >
                      <Link href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroupContent>
          <SidebarMenu>
            {showFeedback ? (
              <SidebarMenuItem>
                <FeedbackDialog
                  trigger={
                    <SidebarMenuButton tooltip="Comentarios">
                      <MessageSquare />
                      <span>Comentarios</span>
                    </SidebarMenuButton>
                  }
                />
              </SidebarMenuItem>
            ) : null}
            {!currentIsClient && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild tooltip="Documentación">
                  <Link href="https://docs.usesend.com" target="_blank">
                    <BookOpenText />
                    <span>Documentación</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarGroupContent>
        {isSelfHosted() && <VersionInfo />}
        <NavUser
          user={{
            name:
              session?.user.name ||
              session?.user.email?.split("@")[0] ||
              "User",
            email: session?.user.email || "",
            avatar: session?.user.image || "",
          }}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

export function NavUser({
  user,
}: {
  user: {
    name?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
}) {
  const { isMobile } = useSidebar();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                {user.avatar ? (
                  <AvatarImage
                    src={user.avatar}
                    alt={user.name ?? user.email ?? ""}
                  />
                ) : null}
                <AvatarFallback className="rounded-lg capitalize">
                  {user.name?.charAt(0) ?? user.email?.charAt(0) ?? "U"}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">
                  {user.name ?? user.email ?? "User"}
                </span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.name ? user.email : ""}
                </span>
              </div>
              <MoreVerticalIcon className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[var(--radix-dropdown-menu-trigger-width)] min-w-56 rounded-xl"
            side={isMobile ? "bottom" : "top"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  {user.avatar ? (
                    <AvatarImage
                      src={user.avatar}
                      alt={user.name ?? user.email ?? ""}
                    />
                  ) : null}
                  <AvatarFallback className="rounded-lg capitalize">
                    {user.name?.charAt(0) ?? user.email?.charAt(0) ?? "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium">
                    {user.name ?? user.email ?? "User"}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {user.name ? user.email : ""}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href="/settings/team">
                  <UsersIcon />
                  Equipo
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/settings">
                  <GaugeIcon />
                  Uso
                </Link>
              </DropdownMenuItem>
              <div className="px-2 py-0.5">
                <ThemeSwitcher />
              </div>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => signOut()}>
              <LogOutIcon />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function VersionInfo() {
  const appVersion = env.NEXT_PUBLIC_APP_VERSION;
  const gitSha = env.NEXT_PUBLIC_GIT_SHA;

  // If no version info available, don't render anything
  if (!appVersion && !gitSha) {
    return null;
  }

  const displayVersion =
    appVersion && appVersion !== "unknown"
      ? appVersion
      : gitSha && gitSha !== "unknown"
        ? gitSha.substring(0, 7)
        : null;

  if (!displayVersion) {
    return null;
  }

  return (
    <div className="px-2 py-2 text-xs text-muted-foreground">
      <div className="flex items-center justify-between">
        <span>Versión</span>
        <span className="font-mono">{displayVersion}</span>
      </div>
    </div>
  );
}
