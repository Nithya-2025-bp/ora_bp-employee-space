import Image from "next/image"
import LoginForm from "@/components/login-form"

export default function Home() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image src="/panther1.png" alt="Blu Pantera Background" fill priority className="object-cover" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex w-full max-w-7xl items-center justify-between px-4 md:px-8">
        {/* Login Form Container - positioned on the left */}
        <div className="w-full max-w-md">
          <LoginForm />
        </div>

        {/* Spacer for right side */}
        <div className="hidden md:block md:w-1/2"></div>
      </div>
    </main>
  )
}
