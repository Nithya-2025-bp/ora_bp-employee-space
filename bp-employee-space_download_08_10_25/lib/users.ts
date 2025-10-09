export interface User {
  email: string
  firstName: string
  lastName: string
  isAdmin: boolean
  password: string
  passwordChanged: boolean
  profilePicture?: string
}

// Initial user data with default password
export const users: User[] = [
  {
    email: "alistair.bell@blupantera.com",
    firstName: "Alistair",
    lastName: "Bell",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "david.shupe@blupantera.com",
    firstName: "David",
    lastName: "Shupe",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "Filippo.Peverini@blupantera.com",
    firstName: "Filippo",
    lastName: "Peverini",
    isAdmin: true,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "jay.radhakrishnan@blupantera.com",
    firstName: "Jayaganesh",
    lastName: "Radhakrishnan",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "Luca.Peverini@blupantera.com",
    firstName: "Luca",
    lastName: "Peverini",
    isAdmin: true,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "Nelson.Acuna@blupantera.com",
    firstName: "Nelson",
    lastName: "Acuna",
    isAdmin: true,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "Rao.Lakkoju@blupantera.com",
    firstName: "Rao",
    lastName: "Lakkoju",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "richard.williams@blupantera.com",
    firstName: "Richard",
    lastName: "Williams",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "roelof.lubbe@blupantera.com",
    firstName: "Roelof",
    lastName: "Lubbe",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "rovin.w@blupantera.com",
    firstName: "Rovin",
    lastName: "Wickramaskera",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "ryan.wan@blupantera.com",
    firstName: "Ryan",
    lastName: "Wan",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "tony.hall@blupantera.com",
    firstName: "Tony",
    lastName: "Hall",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
  {
    email: "vijender.sangwan@blupantera.com",
    firstName: "Vijender",
    lastName: "Sangwan",
    isAdmin: false,
    password: "B1gBlu3P4nth3r",
    passwordChanged: false,
  },
]

// In a real application, you would use a secure database and proper password hashing
