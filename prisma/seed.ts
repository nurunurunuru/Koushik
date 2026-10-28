import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Create admin user
  const adminEmail = "admin@recruiter.com";
  let existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash("admin123", 10);
    existingAdmin = await prisma.user.create({
      data: {
        name: "Admin User",
        email: adminEmail,
        password: hashedPassword,
        role: "ADMIN",
      },
    });
    console.log("✅ Admin user created: admin@recruiter.com / admin123");
  } else {
    console.log("ℹ️  Admin user already exists");
  }

  // Create a demo candidate account
  const candidateEmail = "candidate@example.com";
  const existingCandidate = await prisma.user.findUnique({
    where: { email: candidateEmail },
  });
  if (!existingCandidate) {
    const hashedPassword = await bcrypt.hash("candidate123", 10);
    await prisma.user.create({
      data: {
        name: "Demo Candidate",
        email: candidateEmail,
        password: hashedPassword,
        role: "CANDIDATE",
      },
    });
    console.log("✅ Demo candidate created: candidate@example.com / candidate123");
  } else {
    console.log("ℹ️  Demo candidate already exists");
  }

  // Create sample jobs
  const sampleJobs = [
    {
      title: "Senior Software Engineer",
      description: "We are looking for an experienced software engineer to join our platform team. You will work on building scalable microservices and improving our developer experience.",
      requirements: "- 5+ years of backend engineering experience\n- Strong knowledge of distributed systems\n- Experience with Node.js or Go\n- Familiarity with MongoDB or PostgreSQL",
      responsibilities: "- Design and build scalable microservices\n- Improve developer tooling and CI/CD\n- Mentor junior engineers",
      skills: "Node.js, TypeScript, MongoDB, Microservices, Docker, Kubernetes",
      employmentType: "FULL_TIME",
      experienceLevel: "SENIOR",
      salaryRange: "$140,000 - $180,000/year",
      department: "Engineering",
      location: "San Francisco, CA",
      status: "ACTIVE",
      interviewQuestions: JSON.stringify([
        "Tell me a bit about your background and the kind of backend systems you've worked on.",
        "Can you describe a distributed system you built or maintained, and a challenge you ran into?",
        "How do you approach designing a new microservice from scratch?",
        "Tell me about a time you mentored a junior engineer. What was that like?",
        "What's your experience with Docker and Kubernetes in production?",
        "Why are you interested in this role, and what are you hoping to grow into?",
      ]),
    },
    {
      title: "Product Designer",
      description: "Join our design team to create intuitive and beautiful user experiences for our voice AI platform.",
      requirements: "- 3+ years of product design experience\n- Strong portfolio of shipped products\n- Proficiency in Figma",
      responsibilities: "- Design end-to-end user flows\n- Conduct user research\n- Collaborate closely with engineering",
      skills: "Figma, UX Research, Prototyping, Design Systems",
      employmentType: "FULL_TIME",
      experienceLevel: "MID",
      salaryRange: "$110,000 - $140,000/year",
      department: "Design",
      location: "Remote",
      status: "ACTIVE",
    },
    {
      title: "AI/ML Engineer",
      description: "Help us push the boundaries of conversational AI. Work on speech recognition, natural language understanding, and voice synthesis.",
      requirements: "- MS/PhD in CS, ML, or related field (or equivalent experience)\n- Experience with PyTorch or TensorFlow\n- Background in NLP or speech processing",
      responsibilities: "- Train and fine-tune conversational AI models\n- Improve speech recognition accuracy\n- Publish and share research internally",
      skills: "Python, PyTorch, NLP, Speech Recognition, LLMs",
      employmentType: "FULL_TIME",
      experienceLevel: "SENIOR",
      salaryRange: "$160,000 - $210,000/year",
      department: "AI Research",
      location: "New York, NY",
      status: "ACTIVE",
    },
    {
      title: "DevOps Engineer",
      description: "Build and maintain our cloud infrastructure, CI/CD pipelines, and monitoring systems.",
      requirements: "- Experience with AWS or GCP\n- Strong scripting skills (Bash/Python)\n- Experience with Terraform",
      responsibilities: "- Maintain CI/CD pipelines\n- Manage cloud infrastructure\n- Set up monitoring and alerting",
      skills: "AWS, Terraform, Kubernetes, CI/CD, Monitoring",
      employmentType: "FULL_TIME",
      experienceLevel: "MID",
      salaryRange: "$120,000 - $155,000/year",
      department: "Engineering",
      location: "Remote",
      status: "DRAFT",
    },
  ];

  for (const jobData of sampleJobs) {
    const existing = await prisma.job.findFirst({
      where: { title: jobData.title },
    });
    if (!existing) {
      await prisma.job.create({ data: { ...jobData, adminId: existingAdmin!.id } });
      console.log(`✅ Job created: ${jobData.title}`);
    }
  }

  // Jobs created before admin signup existed have no owner — give them to the seeded admin.
  const backfilled = await prisma.job.updateMany({
    where: { OR: [{ adminId: null }, { adminId: { isSet: false } }] },
    data: { adminId: existingAdmin!.id },
  });
  if (backfilled.count > 0) {
    console.log(`✅ Assigned ${backfilled.count} existing job(s) to ${adminEmail}`);
  }

  console.log("\n🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
