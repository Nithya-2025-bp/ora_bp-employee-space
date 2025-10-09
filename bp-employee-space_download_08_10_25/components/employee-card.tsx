import type React from "react"
import Image from "next/image"

interface Employee {
  id: number
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  profilePicture?: string
}

interface EmployeeCardProps {
  employee: Employee
}

const EmployeeCard: React.FC<EmployeeCardProps> = ({ employee }) => {
  return (
    <div className="bg-white shadow rounded-lg p-4 flex items-center space-x-4">
      {/* Profile Photo */}
      <div className="h-12 w-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
        {employee.profilePicture ? (
          <Image
            src={employee.profilePicture || "/placeholder.svg"}
            alt={`${employee.firstName} ${employee.lastName}`}
            width={48}
            height={48}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-gray-100">
            <svg className="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </div>
        )}
      </div>

      {/* Employee Info */}
      <div>
        <h3 className="text-lg font-semibold">
          {employee.firstName} {employee.lastName}
        </h3>
        <p className="text-gray-500">{employee.jobTitle}</p>
        <a href={`mailto:${employee.email}`} className="text-blue-500 hover:underline">
          {employee.email}
        </a>
      </div>
    </div>
  )
}

export default EmployeeCard
