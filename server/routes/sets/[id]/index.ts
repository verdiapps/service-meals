import { ObjectId } from "mongodb";

export default defineEventHandler(async (event) => {
  const userId = await getUserId(event);
  const id = getRouterParam(event, "id");

  if (!ObjectId.isValid(id)) {
    throw createError({ statusCode: 400, message: "Invalid set ID" });
  }

  const set = (
    await ModelSets.aggregate([
      {
        $match: {
          _id: new ObjectId(id),
          userId,
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
              categoryName: {
                $first: "$ingredientDetails.categoryDetails.name",
              },
              calories: "$ingredientDetails.calories",
              proteins: "$ingredientDetails.proteins",
              grams: "$ingredientDetails.grams",
            },
          },
        },
      },
      {
        $limit: 1,
      },
    ])
  )[0];

  if (!set) {
    throw createError({ statusCode: 404, message: "Set not found" });
  }

  return set;
});
