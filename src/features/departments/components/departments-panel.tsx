// Departments management panel — list + create + per-row edit/deactivate.
// Rendered inside the admin console (which enforces Super Admin access; the API
// re-checks every write).
"use client";

import { useState } from "react";
import { MoreHorizontal, Pencil, Ban, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useDepartments,
  useDeactivateDepartment,
  useUpdateDepartment,
} from "@/features/departments/hooks/use-departments";
import { DepartmentDialog } from "@/features/departments/components/department-dialog";
import type { Department } from "@/features/departments/types";

export function DepartmentsPanel() {
  const { data: departments, isPending, isError, error, refetch } = useDepartments();
  const deactivate = useDeactivateDepartment();
  const reactivate = useUpdateDepartment();

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold text-foreground">All departments</h2>
          <p className="text-sm text-muted-foreground">
            The org structure’s top level. Classes, staff, and students sit under a department.
          </p>
        </div>
        <DepartmentDialog mode="create" />
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
                <TableHead>Status</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {departments.map((d) => (
                <TableRow key={d.id} className={d.isActive ? "" : "opacity-60"}>
                  <TableCell className="font-mono text-xs font-medium">{d.code}</TableCell>
                  <TableCell>{d.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.counts?.classes ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{d.counts?.users ?? 0}</TableCell>
                  <TableCell>
                    <StatusPill active={d.isActive} />
                  </TableCell>
                  <TableCell>
                    <RowActions
                      dept={d}
                      onDeactivate={() => deactivate.mutate(d.id)}
                      onReactivate={() => reactivate.mutate({ id: d.id, isActive: true })}
                    />
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

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs ${
        active ? "text-muted-foreground" : "text-destructive"
      }`}
    >
      <span
        className={`size-1.5 rounded-full ${active ? "bg-status-present" : "bg-status-absent"}`}
      />
      {active ? "Active" : "Inactive"}
    </span>
  );
}

function RowActions({
  dept,
  onDeactivate,
  onReactivate,
}: {
  dept: Department;
  onDeactivate: () => void;
  onReactivate: () => void;
}) {
  // The edit dialog is controlled by state and rendered OUTSIDE the menu — a
  // Dialog can't be triggered from inside a DropdownMenuItem (the menu closes on
  // select and would unmount the trigger). The menu item just opens it.
  const [editing, setEditing] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${dept.name}`}>
              <MoreHorizontal className="size-4" />
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => setEditing(true)}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          {dept.isActive ? (
            <DropdownMenuItem variant="destructive" onClick={onDeactivate}>
              <Ban className="size-4" />
              Deactivate
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onClick={onReactivate}>
              <RotateCcw className="size-4" />
              Reactivate
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <DepartmentDialog
        mode="edit"
        department={dept}
        open={editing}
        onOpenChange={setEditing}
      />
    </>
  );
}

function PanelMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}
