// Students list — browse students and open a student's admission form.
// Dept-scoped by the API.
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
import { useStudents } from "@/features/students/hooks/use-students";

export function StudentsList() {
  const { data: students, isPending, isError, error, refetch } = useStudents();

  return (
    <div className="rounded-lg border border-border">
      {isPending ? (
        <Message>Loading students…</Message>
      ) : isError ? (
        <Message>
          <span className="text-destructive">
            {error instanceof Error ? error.message : "Couldn’t load students."}
          </span>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="mt-3">
            Try again
          </Button>
        </Message>
      ) : students.length === 0 ? (
        <Message>No students yet. Add the first one above.</Message>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Register no</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Roll no</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((s) => (
              <TableRow key={s.id} className={s.isActive ? "" : "opacity-60"}>
                <TableCell className="font-mono text-xs font-medium">{s.registerNumber}</TableCell>
                <TableCell>{s.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">
                  {s.rollNumber ?? "—"}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Open admission form for ${s.name}`}
                    nativeButton={false}
                    render={<Link href={`/admin/students/${s.id}`} />}
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
