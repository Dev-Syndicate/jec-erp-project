// Faculty list — browse staff and open a member's profile. Dept-scoped by the API.
"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useFacultyList } from "@/features/faculty/hooks/use-faculty";

export function FacultyList() {
  const { data: faculty, isPending, isError, error, refetch } = useFacultyList();

  return (
    <div className="rounded-lg border border-border">
      {isPending ? (
        <Message>Loading faculty…</Message>
      ) : isError ? (
        <Message>
          <span className="text-destructive">
            {error instanceof Error ? error.message : "Couldn’t load faculty."}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
            Try again
          </Button>
        </Message>
      ) : faculty.length === 0 ? (
        <Message>No faculty yet. Provision the first one above.</Message>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Designation</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Department</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {faculty.map((f) => (
              <TableRow key={f.id} className={f.isActive ? "" : "opacity-60"}>
                <TableCell className="font-medium">{f.name}</TableCell>
                <TableCell className="text-muted-foreground">{f.designation ?? "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{f.roles.join(" · ") || "—"}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{f.departmentCode ?? "—"}</TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Open profile for ${f.name}`}
                    nativeButton={false}
                    render={<Link href={`/admin/faculty/${f.id}`} />}
                  >
                    <ChevronRight className="size-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

function Message({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
