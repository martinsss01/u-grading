import { cn } from "@/lib/utils"

function P({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="p" className={cn(className)} {...props} />
}

export { P }
