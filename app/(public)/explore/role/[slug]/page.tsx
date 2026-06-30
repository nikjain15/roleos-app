import { notFound } from "next/navigation";
import ExploreHeader from "@/components/explore/ExploreHeader";
import AskRo from "@/components/explore/AskRo";
import RoleList from "@/components/explore/RoleList";
import { archetypeBySlug, archetypeRoles } from "@/lib/explore";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = await archetypeBySlug(slug);
  return name
    ? { title: `${name} roles in the Index | RoleOS`, description: `Every ${name} role RoleOS is tracking. Ask RO about them.` }
    : { title: "Role type not in the Index | RoleOS" };
}

export default async function RoleTypePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const name = await archetypeBySlug(slug);
  if (!name) notFound();
  const roles = await archetypeRoles(name);
  return (
    <>
      <ExploreHeader crumbs={[{ label: "Index", href: "/explore" }, { label: "Role types", href: "/explore/roles" }, { label: name }]} />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-bold tracking-tight">{name}</h1>
        <p className="mt-1 text-sm text-tx2">{roles.length} open {roles.length === 1 ? "role" : "roles"} of this type in the Index.</p>
        <div className="mt-8">
          <RoleList roles={roles} />
        </div>
        <AskRo
          scope={{ archetype: name }}
          label={`${name} roles`}
          suggestions={[`Which companies have the most ${name} roles?`, "What do they require?"]}
        />
      </main>
    </>
  );
}
