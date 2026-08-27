export async function createAnnexVii(db, annexVii) {
  await db.collection('annex-vii').insertOne({ ...annexVii })

  return annexVii
}
