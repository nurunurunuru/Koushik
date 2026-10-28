import NextAuth from "next-auth";
import { authOptions } from "@/src/lib/authoption";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
