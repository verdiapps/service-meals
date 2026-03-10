const querySchema = z.object({
  offset: z.number().int().default(0),
  limit: z.number().int().default(10),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

export default defineEventHandler(async (event) => {
  const { offset = 0, limit = 10, startDate, endDate } = getQuery(event);
  const convertedOffset = Number(offset);
  const convertedLimit = Number(limit);

  await zodValidateData(
    {
      offset: convertedOffset,
      limit: convertedLimit,
      startDate,
      endDate,
    },
    querySchema.parse,
  );

  const userId = await getUserId(event);

  return await ModelSets.aggregate([
    {
      $match: {
        userId,
        ...buildDateFilter(startDate as string, endDate as string),
      },
    },
    {
      $unwind: {
        path: "$ingredients",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $lookup: {
        from: ModelIngredients.modelName,
        let: { id: "$ingredients.id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $eq: [{ $toObjectId: "$$id" }, "$_id"],
              },
            },
          },
          {
            $lookup: {
              from: ModelCategories.modelName,
              localField: "categoryId",
              foreignField: "_id",
              pipeline: [
                {
                  $limit: 1,
                },
              ],
              as: "categoryDetails",
            },
          },
          {
            $limit: 1,
          },
        ],
        as: "ingredientDetails",
      },
    },
    {
      $unwind: {
        path: "$ingredientDetails",
        preserveNullAndEmptyArrays: true,
      },
    },
    {
      $group: {
        _id: "$_id",
        userId: { $first: "$userId" },
        createdAt: { $first: "$createdAt" },
        updatedAt: { $first: "$updatedAt" },
        ingredients: {
          $push: {
            id: "$ingredients.id",
            value: "$ingredients.value",
            additionalInfo: "$ingredients.additionalInfo",
            name: "$ingredientDetails.name",
            categoryId: "$ingredientDetails.categoryId",
            categoryName: { $first: "$ingredientDetails.categoryDetails.name" },
            calories: "$ingredientDetails.calories",
            proteins: "$ingredientDetails.proteins",
            grams: "$ingredientDetails.grams",
          },
        },
      },
    },
    {
      $sort: { createdAt: -1 },
    },
    {
      $skip: convertedOffset,
    },
    {
      $limit: convertedLimit,
    },
  ]);
});
