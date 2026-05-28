import { ObjectId } from "mongodb";

const validationSchema = z.object({
	userId: z.string().min(1, "User ID is required"),
});

export default defineEventHandler(async (event) => {
	const { authorizationBase } = useRuntimeConfig();
	const user = await getInitialUser(event, authorizationBase);
	if (!can(user, "apply-templates")) {
		throw createError({ statusCode: 403, message: "Forbidden" });
	}

	const templateId = getRouterParam(event, "id");
	if (!ObjectId.isValid(templateId)) {
		throw createError({ statusCode: 400, message: "Invalid template ID" });
	}

	const validatedBody = await zodValidateBody(event, validationSchema.parse);
	const { userId } = validatedBody;

	try {
		// 1. Находим template с полной структурой данных
		const templateData = await ModelTemplate.aggregate([
			{ $match: { _id: new ObjectId(templateId) } },
			{
				$lookup: {
					from: ModelCategories.modelName,
					localField: "_id",
					foreignField: "templateId",
					pipeline: [
						{
							$lookup: {
								from: ModelIngredients.modelName,
								localField: "_id",
								foreignField: "categoryId",
								as: "ingredients",
							},
						},
					],
					as: "categories",
				},
			},
		]);

		if (!templateData || templateData.length === 0) {
			throw createError({
				statusCode: 404,
				statusMessage: "Template not found",
			});
		}

		const template = templateData[0];
		const createdCategories = [];
		const createdIngredients = [];

		const userCategories = await ModelCategories.find({
			userId,
			templateId: null,
		}).select("_id");

		if (userCategories.length > 0) {
			const userCategoryIds = userCategories.map((category) => category._id);
			await ModelIngredients.deleteMany({
				categoryId: { $in: userCategoryIds },
			});
			await ModelCategories.deleteMany({
				_id: { $in: userCategoryIds },
				userId,
			});
		}

		for (const category of template.categories) {
			const newCategory = new ModelCategories({
				userId,
				name: category.name,
				templateId: null,
			});
			const savedCategory = await newCategory.save();
			createdCategories.push(savedCategory);

			for (const ingredient of category.ingredients) {
				const newIngredient = new ModelIngredients({
					userId,
					categoryId: savedCategory._id,
					name: ingredient.name,
					calories: ingredient.calories,
					proteins: ingredient.proteins,
					grams: ingredient.grams,
					unit: ingredient.unit,
					isAlcohol: ingredient.isAlcohol,
				});
				const savedIngredient = await newIngredient.save();
				createdIngredients.push(savedIngredient);
			}
		}

		return {
			message: "Template applied successfully",
			data: {
				templateId,
				userId,
				applied: {
					categories: createdCategories.length,
					ingredients: createdIngredients.length,
				},
				createdCategories,
				summary: {
					templateName: template.name,
					appliedAt: new Date().toISOString(),
				},
			},
		};
	} catch (error) {
		console.error("Error applying template:", error);

		if (error.statusCode) {
			throw error;
		}

		throw createError({
			statusCode: 500,
			statusMessage: "Failed to apply template",
			data: error.message,
		});
	}
});
