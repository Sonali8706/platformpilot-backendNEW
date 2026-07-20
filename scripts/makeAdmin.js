require('dotenv').config();
const prisma = require('../utils/prismaClient');

const targetEmail = process.argv[2];

async function main() {
  if (!targetEmail) {
    console.error('Usage: node scripts/makeAdmin.js <email>');
    process.exit(1);
  }

  const user = await prisma.user.update({
    where: { email: targetEmail },
    data: { role: 'admin' },
  });

  console.log(`${user.email} is now an admin.`);
}

main()
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });