// Departments management panel — lists departments with a create action.
// Rendered inside the admin console (which enforces Super Admin access).
"use client";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useDepartments } from "@/features/departments/hooks/use-departments";
import { CreateDepartmentDialog } from "@/features/departments/components/create-department-dialog";

export function DepartmentsPanel() {
  const { data: departments, isPending, isError, error, refetch } = useDepartments();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">Departments</h2>
          <p className="text-sm text-muted-foreground">
            The org structure’s top level. Classes, staff, and students sit under a department.
          </p>
        </div>
        <CreateDepartmentDialog />
      </div>

      <div className="rounded-lg border border-border">
        {isPending ? (
          <PanelMessage>Loading departments…</PanelMessage>
        ) : isError ? (
          <PanelMessage>
            <span className="text-destructive">
              {error instanceof Error ? error.message : "Couldn’t load departments."}
            </span>
            <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
              Try again
            </Button>
          </PanelMessage>
        ) : departments.length === 0 ? (
          <PanelMessage>
            No departments yet. Create the first one to start building the org structure.
          </PanelMessage>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Classes</TableHead>
                <TableHead className="text-right">Members</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-xs font-medium">{d.code}</TableCell>
                  <TableCell>{d.name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.counts?.classes ?? 0}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {d.counts?.users ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <span
                      className={`inline-flex items-center gap-1.5 text-xs ${
                        d.isActive ? "text-muted-foreground" : "text-destructive"
                      }`}
                    >
                      <span
                        className={`size-1.5 rounded-full ${
                          d.isActive ? "bg-status-present" : "bg-status-absent"
                        }`}
                      />
                      {d.isActive ? "Active" : "Inactive"}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  );
}

function PanelMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
