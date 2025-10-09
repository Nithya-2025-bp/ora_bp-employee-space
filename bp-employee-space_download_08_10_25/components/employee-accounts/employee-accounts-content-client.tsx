"use client"

import dynamic from "next/dynamic"

const EmployeeAccountsContent = dynamic(() => import("@/components/employee-accounts/employee-accounts-content"), {
  loading: () => (
    <div className="flex flex-col items-center justify-center h-64">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0051FF] border-t-transparent mb-4"></div>
      <p className="text-gray-600">Loading employee accounts interface...</p>
    </div>
  ),
  ssr: false, // Disable server-side rendering for this component
})

export default EmployeeAccountsContent
